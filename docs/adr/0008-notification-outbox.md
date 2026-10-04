# Notifications go through an outbox the database wakes a function to drain

The spec puts side effects that leave the database in edge functions ([ADR-0001](0001-supabase-write-discipline.md)) and names web push and Resend as the channels ([ADR-0006](0006-operational-vendors.md)), but leaves open how a row committing in Postgres becomes a message on a phone: what records that it is owed, what sends it, and what starts the sender.
This ADR pins the shape, decided on ticket [#20](https://github.com/KyleKDang/toploader/issues/20), because every later event (proposals, meetups, chat, verification) rides it and would otherwise re-invent it.

## The shape

**A transactional outbox.**
`public.notifications` holds one row per recipient per event, written by a trigger in the same transaction as the event it is about, rendered as it is written: title, body, the app path a tap opens, and a topic a browser collapses duplicates by.
An event that commits has its notifications and one that rolls back has none, with nothing to keep in step.
Which channels a row goes out on is the spec's notification matrix, held in SQL as `notification_channels(kind)` and stored on the row, so a producer cannot get it wrong and the sender does what the row says.

**A claim, not a scan.**
The sender takes rows through `claim_notifications`, which marks a batch claimed with `for update skip locked` in the one statement.
Two senders running at once therefore never hold the same row, and neither waits for the other.
Delivery is recorded per channel, so a run that pushed and then could not email retries only the email; a claim lapses after five minutes, and a row that keeps failing is retried until it is a day old, because email is the reliability floor and a Resend outage is not a reason to lose a verification result.
Every failing run is a Sentry error, so a day of retries is not a quiet one.

**A Deno edge function as the sender, woken by the database.**
`supabase/functions/notify` drains the outbox.
A statement trigger on the outbox calls it through `pg_net` the moment rows are written, and a `pg_cron` job calls it once a minute so a lost wake costs a minute rather than waiting for the next event anywhere in the app.
The function's URL and the bearer secret it accepts are Vault secrets, so nothing hosted is in the repo and a stack without them (the local stack, CI) has an inert wake and an outbox that waits.

**The sender's body is runtime-neutral.**
`supabase/functions/_shared/notify.ts` uses fetch, Web Crypto and supabase-js and nothing that is only in Deno, so the seam-2 suite runs it in-process under Node against the local stack with the push service and Resend faked at the network edge, the way the reaper and the Catalog sync are tested.
The Deno file around it holds only secrets, the caller check, and Sentry, and `deno check` runs over it in `npm run typecheck`.

## Considered options

- **A `notified_at` column on `match_events`.**
  Enough for one event with one recipient, but a Match has two recipients with their own browsers and failures, and the next event is a Trade's, so the column would have been reinvented per table.
- **A GitHub Actions job, as the Catalog sync and the reaper are.**
  A schedule can run at most every five minutes and is often late by more, which is wrong for a chat message and marginal for a Match, and the runs would spend the free minutes the backup and the sync need.
- **Sending from the trigger itself with `pg_net`.**
  Web push is encrypted per subscription (RFC 8291) and signed per push service (RFC 8292), which is not a thing to do in SQL.
- **Calling the function only from the trigger, with no sweep.**
  `pg_net` is fire-and-forget: a wake the function was too cold to answer, or that arrived while the push service was down, would lose the notification until another event happened to fire.
- **A worker polling on a timer with no wake.**
  A minute's latency on every notification, when the trigger makes most of them immediate for free.

## Consequences

- Every later notification is a producer trigger writing rendered rows to the outbox and nothing else; the matrix, the claim, the channels and the wake are already there.
- The outbox is server-only: a row names what another Trader listed or wants and outlives the pair it was about, so no client role reads it, and `match_events`' denial tests have their counterparts here.
- Delivery is at-least-once per channel: a channel that succeeded but whose mark did not land is sent again by the next run.
  A browser collapses a repeated push by its topic, so an email is the one thing a Trader could see twice, and only when Resend accepted it and the database was unreachable in the same instant.
- The wake crosses Docker's edge and has no automated seam; it is verified by hand when the function is first deployed, and the sweep is what makes a misconfigured wake a latency problem rather than a lost one.
- Two new extensions on the hosted database, `pg_net` and `pg_cron`, and one edge function CI deploys on every merge to `main`.

## Amendment, 2026-09-27 (ticket #72)

A new Match alerts only the Trader on the other side of the change that made the pair hold.
A Listing going active alerts the Traders who want it, a Want being added alerts the Traders whose Listings satisfy it, and a Trader changing City alerts the Traders they now match; the Trader whose Listing, Want, or move it was gets no alert for it.
The first producer wrote a row for both Traders of every pair, which is right for one pair and wrong for a City.
Measured on a local stack holding 1,600 active Listings of one Card in one City, one Want queued 3,200 notifications, 1,600 of them to the Trader who had just added it, each under its own topic, so no browser would have collapsed them.
That Trader is in the app, looking at the Matches the Want made, so their half is noise, and dropping it halves what the change writes.
The other half is kept whole: each of those Traders is told about a pair of their own, which is the alert the notification matrix promises.
The side is decided by whose row changed, not by who is signed in, so a Listing put back to active by a cancelled Trade alerts the Traders who want it and not its lister, whoever cancelled.
An alert is still per pair: a Trader with three Listings of the wanted Card is told three times, and a pair still notifies once, because `match_events` keeps the first time each pair held.

## Amendment, 2026-10-03 (ticket #83)

`claim_notifications` hands each of its two updates the rows it took as an array of ids (`id = any(...)`), rather than joining them to the rows it took.
It is a SQL function, so its statement is planned with `batch` unknown, and the planner could not see that a call takes at most fifty batches of rows.
It planned both updates as hash joins over a sequential scan of the whole outbox, sent rows included, and of `auth.users`.
So every call read every row the outbox had ever held to write at most a thousand of them.
Measured on a local stack whose outbox held five million rows, a call took 600 ms to 1.3 s, against 12 ms for the same statement with the limit written in.
A backlog of 600,000 silent rows took minutes to drain, where it now takes about 18 s.
An array of ids is estimated as a handful of rows whatever `batch` is, so both updates look their rows up by primary key and a call's cost follows its batch, not the table.
What a call takes, settles, claims and returns is unchanged, and so is the notifier: claim order, fifty batches a call, and a hundred calls a run.

## Amendment, 2026-10-03 (ticket #87)

Unblocking records the Matches that first held while the block stood, and alerts both Traders of each, not only the other side of the change.
The 2026-09-27 rule drops the alert of the Trader who made the change because they are looking at what it made, and a Trader who unblocks has seen none of these Matches: `match_pairs` left out every pair between the two while the block stood, so neither Trader was ever told of them.
A Match recorded before the block was already seen, so it comes back without a second alert.
These rows are written by `unblock_trader` rather than a trigger on `blocks`, because a block row is also deleted when an account is, and that deletion must alert nobody.
They are still written in the same transaction as the change they are about, which is what the outbox needs.
The copy and links of a Match alert live in one function, `queue_match_alerts`, which both producers call.
