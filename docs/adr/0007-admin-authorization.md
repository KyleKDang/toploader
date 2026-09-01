# A Founder is a row in a table only migrations can write

Tickets [#26](https://github.com/KyleKDang/pokemon/issues/26) and [#28](https://github.com/KyleKDang/pokemon/issues/28) both assert that a non-founder cannot reach the founder admin view, and #26 ships a database-seam test for it, but the spec's `traders` table had no admin field and no document said how a founder is designated.
This ADR defines the mechanism.
Who the founders actually are is a person question and belongs to [#36](https://github.com/KyleKDang/pokemon/issues/36); this decision is written so that answer becomes a one-line seed migration.

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

## Consequences

- The spec's RPC list gains a note that ban and account deletion are edge functions, so the next reader does not try to write them in PL/pgSQL.
- Admin rights are visible in git history and cannot be granted from inside the running app, including by a Founder.
- Naming the founders is deferred to #36 and lands as a seed migration; until it lands, seam-1 fixtures seed their own Founder and the tests do not wait on the answer.
- Sentry's free plan allows one dashboard user ([ADR-0006](0006-operational-vendors.md)), so the same #36 answer that names the reviewing founder should name the monitoring user.
