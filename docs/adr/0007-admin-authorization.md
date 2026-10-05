# A Founder is a row in a table only migrations can write

Tickets [#26](https://github.com/KyleKDang/toploader/issues/26) and [#28](https://github.com/KyleKDang/toploader/issues/28) both assert that a non-founder cannot reach the founder admin view, and #26 ships a database-seam test for it, but the spec's `traders` table had no admin field and no document said how a founder is designated.
This ADR defines the mechanism.
Who the founders actually are is a person question and belongs to [#36](https://github.com/KyleKDang/toploader/issues/36); this decision is written so that answer becomes a one-line seed migration.

## Designation

A **Founder** is a Trader whose `trader_id` appears in a dedicated `founders` table.
The table is deny-all to every client under RLS, and policies read it only through `is_founder()`, a `SECURITY DEFINER STABLE` helper.
Membership is granted **only by migration**: there is no RPC, no edge function, and no admin screen that writes to `founders`.

That last point is the whole design.
Under the write discipline of [ADR-0001](0001-supabase-write-discipline.md) every state change goes through a named RPC, so a privilege with no RPC has no escalation path to audit.
Granting admin rights becomes a reviewed commit in git rather than a runtime action, which is also what makes it seedable in database-seam fixtures.

A Founder is an ordinary Trader account with a `founders` membership, not a separate non-trading account, because the founders will want to trade to seed liquidity in the launch City.
The cost of that is that a Founder could approve their own verification request, so `approve_verification` rejects self-approval and a seam-1 test proves it.

## How a Founder reads

The admin view reads all `verification_requests` and all `reports` through **additive RLS policies** using `is_founder()`, queried as an ordinary PostgREST client, plus an equivalent storage policy on the private verification bucket.
Reads are not routed through `SECURITY DEFINER` functions.
Keeping the check in the policy leaves one enforcement point per table and makes the foreign-Trader denial test literal: a non-founder selects and gets zero rows.
A `SECURITY DEFINER` read function that forgets its own guard is the classic privilege-escalation bug in this stack, and every such function is a second place the rule can be wrong.
This is consistent with ADR-0001 rather than an exception to it: that ADR routes *state changes* through RPCs and leaves reads to policy-scoped selects.

## How a Founder writes, and why ban is not an RPC

`approve_verification` and the rest of the review actions are named RPCs, as ADR-0001 requires.

**Ban and account deletion cannot be.**
Both must write `auth.users`, which is reachable only through the Supabase Auth admin API with the service-role key, and a Postgres function running as the calling Trader cannot hold that key.
Both are therefore **edge functions**, which is precisely the boundary ADR-0001 already draws: an RPC for transactional logic in the database, an edge function when the side effect leaves it.

- `ban_trader` sets `banned_until` through the Auth admin API and `banned_at` on `traders` in one call. The auth ban kills the refresh token so no new JWT can be issued; the column is what publicly marks the Reputation, as the spec requires, and what write RPCs check.
- `delete_account` deletes the auth user and the Trader's private data while leaving completed Trade Records readable to their counterparties, per [ADR-0005](0005-trade-single-aggregate.md) immutability.

Without this written down, both would be attempted as RPCs and fail late in the ticket.

## Who the founders are

Settled with the partner on [#36](https://github.com/KyleKDang/toploader/issues/36).
Both founders are seeded into `founders`; the review work is Tate's.

- **Tate Nguyen** reviews verification requests, reads reports, and bans, and owns the support inbox, so the Trader who writes in and the Trader who gets banned are handled by the same person.
- **Kyle Dang** holds the same rights and does not exercise them day to day.

Both are seeded rather than the reviewer alone, because `approve_verification` rejects self-approval.
A sole Founder could never become a Verified Trader, since the only account permitted to approve them would be their own, and this ADR already assumes both founders trade to seed liquidity in the launch City.
Two rows also means neither verification nor moderation stops when one founder is unavailable.

Admin rights and the error-monitoring seat come apart here, against what this ADR and [ADR-0006](0006-operational-vendors.md) first assumed.
The reviewing founder is the non-technical one, and Sentry reports production stack traces, so that single seat is Kyle's.

The seed migration names concrete `trader_id`s, so it can only run once both founders hold accounts on the deployed app.
That ordering belongs to [#26](https://github.com/KyleKDang/toploader/issues/26).

## Consequences

- The spec's RPC list gains a note that ban and account deletion are edge functions, so the next reader does not try to write them in PL/pgSQL.
- Admin rights are visible in git history and cannot be granted from inside the running app, including by a Founder.
- The founders are named above and land as a seed migration owned by #26; seam-1 fixtures still seed their own Founder, so the tests never depend on who the real founders are.
- Sentry's free plan allows one dashboard user ([ADR-0006](0006-operational-vendors.md)), and that seat is Kyle's rather than the reviewing founder's, for the reason given above.

## Amendment, 2026-09-28 (ticket #26)

How a review deletes its documents, which this ADR and the spec both required and neither said how.

**An RPC cannot delete a file.**
The rows of `storage.objects` are the index of the files, not the files.
Storage refuses a SQL `delete` on them with a trigger of its own (`protect_objects_delete`), and a row deleted past that trigger would leave the file itself in the bucket with nothing pointing at it.
A file is deleted only through the Storage API.

**So the Founder deletes, and the RPC refuses until they have.**
The reviewing Founder deletes both files through the Storage API, under a delete policy on the bucket that asks `is_founder()`, the additive policy this ADR already uses for reads.
`approve_verification` and `reject_verification` then refuse to record a review while either file is still in Storage.
The order is what makes the rule hold under failure: whatever breaks between the two steps leaves a request still waiting with no documents, never a reviewed request with documents behind it.
A request left that way is rejected by a Founder, and the Trader sends fresh documents.

**A path a request has named is closed for good.**
The Trader's upload policy refuses any path a verification request names, so a file cannot be replaced while its request waits, nor put back once the review has deleted it.
Without that, the check above would hold only at the instant it ran.

**The seed fails on the hosted database unless it seeds both Founders.**
It has to seed nobody on a local stack, where the founders' accounts do not exist, and a migration runs once, so a seed that quietly made one Founder would leave the self-approval deadlock in place for good.
The hosted database is told apart by the notifier's Vault secret, which is set only there ([ADR-0008](0008-notification-outbox.md)).

Considered and rejected:

- **An edge function that deletes and then records.**
  The same two steps in the same order, with a deploy, a secret, and a second enforcement point added.
  The guarantee would still have to live in the RPC, since the RPC stays callable.
- **Recording the review and sweeping the files on a schedule.**
  Every review would leave government IDs in Storage until the next sweep, and a sweep that fails leaves them there silently, which is the one failure this feature exists to rule out.

**Rejection is an RPC of its own**, `reject_verification`, and a Founder can review neither way on their own request.
Only self-approval is dangerous, but one guard shared by both answers is one place for the rule to be right.

**What this leaves open** is a document that never gets a review: uploaded, and never submitted.
The upload has to come before the row that names it, as a Listing photo does ([ADR-0001](0001-supabase-write-discipline.md), amendment for #17), so an abandoned upload is possible.
Reclaiming those is [#88](https://github.com/KyleKDang/toploader/issues/88).

## Amendment, 2026-10-03 (ticket #28)

How `delete_account` deletes, which this ADR required and did not say how.

**The Trader's row outlives the account.**
`traders` was tied to `auth.users` with a cascade, and `trades` names its two Traders without one, so deleting the account of any Trader with a Trade was refused by the database.
The tie is dropped: the row stays, marked `deleted_at`, and every Trade keeps pointing at someone.
A cascade that removed the Trades instead would have taken the other Trader's Trade Record with it, which [ADR-0005](0005-trade-single-aggregate.md) forbids.

**The erasure is a trigger on the account's deletion, not steps in the edge function.**
The function could have deleted the Trader's rows and then the account, as two calls.
Whatever failed between them would leave either an account whose data is gone or data whose owner can no longer ask again.
As a trigger on `auth.users`, the erasure and the account's deletion are one transaction, and it holds for a deletion from the Supabase dashboard as well.
It is the counterpart of the trigger that makes a Trader for every new account.

**So the edge function is thin.**
It asks Auth whose session the request carries, asks the database whether that account may be deleted, deletes that Trader's verification documents through the Storage API, and deletes the account through the Auth admin API.
The documents go before the account for the reason a review deletes them first: a failure after that leaves the account whole and the Trader able to ask again.
Whether the account may be deleted is one database function, `require_deletable_account`, which the erasure calls and so enforces; the edge function calls it first only so that a Founder or a banned Trader, whom the erasure will refuse, does not lose their documents on the way to being refused.
It takes no Trader id, so a Trader can only delete their own account.

**A deleted Trader's session is refused before every request.**
Deleting an account ends its sessions, but an access token already issued is accepted on its signature until it expires, up to an hour later.
PostgREST runs `refuse_deleted_trader()` before every request (`pgrst.db_pre_request`), which refuses a caller whose row is marked deleted.
One check in front of every read and RPC replaces a check inside each, which the next RPC written would have had to remember.
The ban in this ADR has the same hour to close, and this is the place to close it: the same function can refuse a caller whose row is marked banned.

**What the cascade used to guarantee is now a list.**
Every table holding a Trader's own data was emptied by the cascade from `traders`.
With the row kept, the trigger deletes from each by name, so a new table of a Trader's own data has to be added to it.

Considered and rejected:

- **Deleting the Trader's row and pointing their Trades at nobody.**
  Nullable Traders on a Trade would break every rule that reads them, and the Trade Record would stop saying who it was with.
- **Keeping only completed Trades and deleting the rest.**
  A Trade still open would vanish from under the other Trader with no trace, and the Listings on a declined or cancelled one could not be deleted while the Trade named them.
- **Ending the account's sessions sooner by shortening the token's life.**
  It shortens the hour without closing it, and costs every Trader more frequent token refreshes.

## Amendment, 2026-10-04 (ticket #28, the ban)

How `ban_trader` bans, which this ADR required and did not say how.

**The ban's effects are a trigger on the account's ban, as the erasure is a trigger on its deletion.**
This ADR said the function sets `banned_until` through the Auth admin API "and `banned_at` on `traders` in one call".
Two writes from the function would leave a gap between them for a failure: a Trader banned in Auth while still trading here, or marked banned while still able to sign in.
So the function makes the one write, to Auth, and a trigger on `auth.users` does the rest in the same transaction: it takes the Trader out of their City, ends their open Trades as a deletion ends them, withdraws their Listings, and sets `banned_at`.
It holds for a ban from the Supabase dashboard too, of whatever length.

**The function checks who is asking in the database.**
It runs as `service_role`, where `is_founder()` has no caller to ask about, so it asks `require_ban_allowed` with the caller Auth vouched for.
That one function refuses a caller who is not a Founder before it looks at the Trader named, so the answer tells a Trader nothing about who exists.
Whether a Trader may be banned is `require_bannable_trader`, which the trigger calls too, and so enforces: a Founder may not be, since their rights are removed by migration, and a deleted account has nothing left to ban.

**A banned Trader's session is refused before every request**, closing the hour this ADR's deletion amendment left open.
The request check is renamed `refuse_deleted_or_banned_trader` and refuses both.

**A ban is not lifted in the app.**
The trigger fires only when an account becomes banned, so lifting a ban in Auth leaves `banned_at` set and the Trader refused; lifting one is a deliberate two-step errand in `docs/operations.md`.

Considered and rejected:

- **Leaving a banned Trader's open Trades for the other Trader to end.**
  The other Trader would wait on someone who can never answer, and ending it themselves would put the cancellation on their own Reputation rather than the banned Trader's.
- **Deleting the banned Trader's data, as a deletion does.**
  A ban keeps the account so its email address cannot start over, and so the Founders can still read every Trade and report it touched.
