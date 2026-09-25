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
