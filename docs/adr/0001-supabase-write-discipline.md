# Supabase as the whole backend, with a strict write discipline

No free always-on host exists in 2026 (Fly is paid, Render free tier cold-starts and its Postgres expires, Vercel Hobby is non-commercial, AWS free tier lasts 6 months), and roughly 80% of v1 is commodity infrastructure: auth, realtime chat, storage, per-user CRUD.
We therefore run no application server: Supabase provides Postgres, Auth, Realtime, Storage, and edge/scheduled functions at $0/month, and the developer's effort concentrates on the parts that are actually this product (trade state machine, matching, price sync).

The write discipline that keeps business logic in one place: reads go through RLS-guarded selects; every state-changing operation goes through a named Postgres RPC function (transactional logic) or edge function (side effects); direct table writes from clients are denied by default; every policy and RPC ships with a test proving what a foreign user cannot do.

## Considered options

- Own API server (Spring Boot/FastAPI, the developer's wheelhouse): $2-25/month plus year-round ops on a few-hours-per-week schedule, and auth/realtime/storage get rebuilt by hand.
- Hybrid (FastAPI in front of Supabase): the union of both cost columns.

## Consequences

- Learning cost: RLS policy discipline and PL/pgSQL testing.
- Coupling: Auth, Realtime, and the generated API are Supabase-shaped; the data layer is plain Postgres, so the exit is pg_dump plus rewriting the API surface.
- Pre-planned escape hatch: a small FastAPI worker on Fly (~$2/month) beside Supabase if sync or matching outgrow scheduled functions; this is an addition, not a rewrite.
- Server-side business rules mean future mobile clients can't drift: rules change without app-store releases.

## Amendment, 2026-09-19 (ticket #15)

A read that a select cannot express may be a function, as `search_cards` is: it ranks Cards by how well they match, which PostgREST's filters and ordering cannot.
Such a function runs as its caller (`security invoker`, the default), never `security definer`, so the same RLS policies decide what it returns as would decide a select, and it ships with the same denial test.
Writes are unchanged: every state change is still a named RPC or an edge function.

## Amendment, 2026-09-19 (ticket #17)

A file in Storage is written by the client directly, because there is no other way to write one: an RPC is a database call and cannot carry the bytes of a photo, and routing uploads through an edge function would spend the free tier's function budget to add a hop that changes nothing about who may write.
So a Trader uploads a Listing's photos themselves, under a policy that allows writing only beneath their own id, and `create_listing` then refuses any path that is not theirs and any object that is not actually in the bucket.
The discipline is kept where it matters: the row that makes those files a Listing is still written only by a named RPC, and a file nothing references is not a Listing, only litter the reaper collects.
This exception is for file bytes alone. It is not a precedent for writing a table from a client.
