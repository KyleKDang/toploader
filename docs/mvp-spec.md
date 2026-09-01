# MVP spec: Toploader

The app is named Toploader, decided by the partner on ticket [#33](https://github.com/KyleKDang/pokemon/issues/33); it is never named or branded "Pokemon"-anything.
This spec resolves wayfinder ticket [#10](https://github.com/KyleKDang/pokemon/issues/10) and is written so a fresh build effort can start from it alone.
It builds on the [viability brief](viability-brief.md), the five research reports in [docs/research/](research/), the decisions in Founder Questionnaires [#1](https://github.com/KyleKDang/pokemon/issues/7) and [#2](https://github.com/KyleKDang/pokemon/issues/9), and the grilling session recorded on ticket #10.
Domain vocabulary is defined in [CONTEXT.md](../CONTEXT.md); this spec uses those terms exactly.
Architectural decisions are recorded in [docs/adr/](adr/).

## What this app is

An app that organizes safe, in-person Pokemon TCG trades for adult collector-investors, launched one City at a time.
No money ever moves through the app.
The heart of v1 is meetup coordination: propose a Trade, chat, agree a time at a Safe Spot.
The differentiator is the Safety Program, public-facing name **Verified Trading**: Verified Traders, a Safe Spot directory, immutable Trade Records, and Reputation.

## Locked constraints (decided upstream, not revisitable here)

- No money movement through the app in v1; v2 payments only via Stripe-held funds; self-held escrow never ([ADR-0004](adr/0004-no-money-movement.md)).
- No guarantee language anywhere; the Safety Program ships named mechanics instead.
- Scam-loss policy: no cash payouts, stated honestly - ban the scammer, give the victim their Trade Record, mark reputation publicly.
- Neutral branding; "for Pokemon TCG collectors" only in descriptive text, plus a visible non-affiliation disclaimer.
- Web-first PWA at $0/month; Expo/React Native + both stores at a named trigger ([ADR-0002](adr/0002-web-first-pwa.md)).
- One launch City, chosen in ticket [#11](https://github.com/KyleKDang/pokemon/issues/11); pre-launch community is the partner's Discord.
- Entity formation and founder split are ticket [#12](https://github.com/KyleKDang/pokemon/issues/12), not this spec.

## Feature list and cut lines

### v1 (launch, one City)

- Email auth, Trader profiles, City selection, and a self-attested 18-or-over checkbox at signup.
- Catalog of ~20k Cards with Variants, images, and daily Market Prices, synced into our own database ([ADR-0003](adr/0003-price-data-sources.md)).
- Card search with autocomplete as the only card-entry mechanism (no scanning).
- Collection, minimal: Copies owned (Variant + Condition + quantity), each with Market Price, plus a total-value line. No charts, no history view.
- Listings: photos of the actual Copy, Condition, status lifecycle, and an optional asking price / open-to-cash-offers flag (cash passes in person; the app never touches it).
- Wants: Card required, Variant and minimum Condition optional.
- Matches: computed view of Listing-satisfies-Want pairs within the City, with new-match notifications.
- Trade state machine: propose (items both sides) -> counter/accept -> schedule (time + Safe Spot) -> complete / cancel / no-show ([ADR-0005](adr/0005-trade-single-aggregate.md)). A proposal may include an optional cash component on either side, settled in person.
- 1:1 realtime chat, attached to a Trade only.
- ID verification producing Verified Trader status: founder manual review of government ID + selfie in v1, and verification is required to send or accept a Trade proposal (browsing, Collection, Listings, and Wants need none).
- Mutual tap-to-confirm completion producing the immutable Trade Record (participants, items, timestamps, Safe Spot, optional photos).
- Reputation: verified badge, completed-Trade count, member-since, cancellation and no-show counts, Trade Feedback totals.
- Trade Feedback: mutual thumbs up/down after a completed Trade; no free text.
- Safe Spot directory, hand-seeded for the launch City.
- Notifications: web push (Android/desktop), Add-to-Home-Screen onboarding step for iOS, email floor via a free transactional tier for new proposal / proposal accepted / meetup confirmed. Chat is push-only.
- Moderation minimum: report Trader or Listing, block Trader, founder admin ban view, in-app account deletion.
- PWA installability (manifest, service worker, offline shell).
- Published Terms of Service and Privacy Policy, a DMCA designated agent, a CSAM reporting posture, and a support address a Trader who cannot log in can write to.

### v1.5 (trigger: first-city traction, or measured iOS notification pain)

- Expo/React Native app into both stores ($124 first year, already budgeted).
- QR-handshake completion proof replacing/augmenting mutual tap-to-confirm.
- Stripe Identity (~$1.50/check) replacing founder manual ID review.
- In-app per-city chat rooms, only if the Discord proves demand.

### v2 (only behind fee revenue)

- Payments via Stripe Connect with delayed payouts; Stripe holds funds, never us.
- Full portfolio with charts (price snapshots accumulate from day one regardless).
- Card scanning: on-device OCR with scan-then-confirm variant pick.
- Visibility/insight subscriptions.

### Never (in this destination)

- Self-held escrow (federal felony without licenses; see ADR-0004).
- "100% guarantee" or equivalent wording.
- Pokemon-branded name, icon, or marketing lead.
- Livestream auctions; rip-and-ship pack openings.

## Primary user flows

### Onboarding

1. Sign up with email (Supabase Auth), attest to being 18 or over, set display name, pick City.
The attestation is a checkbox, not a date of birth: the product is scoped to adult collectors and the real age check is the founder ID review that gates proposals, so the checkbox exists to make an under-age signup the signer's misrepresentation rather than our collection, at no cost in signups.
Settled on [#36](https://github.com/KyleKDang/pokemon/issues/36).
2. Prompted (skippable) to install: Add-to-Home-Screen instructions on iOS ("install to get trade alerts"), browser install prompt elsewhere; push permission requested on that gesture.
3. Landing view is Matches (empty state points to building Wants and Listings).

### Build Collection and Wants

1. Search picker (autocomplete over Catalog) -> select Card -> pick Variant, Condition, quantity -> saved to Collection.
2. Wants: same picker; Variant and minimum Condition optional.

### Create a Listing

1. From a Collection entry ("list this") or directly from search.
2. Photograph the actual Copy via the OS camera (`<input type="file" capture="environment">`), 1-5 photos.
3. Confirm Variant and Condition; optionally set an asking price / open-to-cash-offers.
4. Listing goes active in the Trader's City.

### Match and propose

1. New Match -> push/email notification -> Matches view shows the pairing and both Traders' Reputation.
2. Either side opens a Trade proposal: select items from each side's Listings, optionally a cash amount on either side, send.
3. Sending or accepting requires Verified Trader status; unverified Traders are routed to verification first.
4. Recipient accepts, declines, or counters (counter replaces the item sets and flips the ball back).

### Schedule and meet

1. On acceptance, the Trade enters scheduling: either side proposes a time + Safe Spot from the directory; the other confirms.
2. Both get confirmation and a reminder notification before the Meetup.
3. At the Meetup both Traders inspect cards, then each taps Complete; when the second tap lands the Trade freezes into its Trade Record and both are prompted for Trade Feedback (thumbs).
4. Either side can cancel before completion (counted on Reputation); a scheduled Trade where one party reports the other absent becomes a no-show (counted).

### Verification

1. Trader submits government ID photo + selfie to a private locked bucket.
2. A founder reviews in the admin view and approves or rejects; Stripe Identity replaces this step at v1.5.
3. On approval: `verified` status set, ID and selfie images deleted; we store only the boolean and timestamp, never documents.
4. On rejection the images are deleted too, and the Trader re-submits fresh ones. Holding rejected strangers' government IDs is the largest avoidable data liability in the app, so no path stores a document past its review.

### Safety and moderation

1. Any profile or Listing can be reported with a reason; reports land in the admin view.
2. Any Trader can block another (hides listings, prevents proposals and chat).
3. Founders can ban (Supabase Auth ban + status flag); banned scammers' Reputation is publicly marked.
4. Victims of an off-app scam get their Trade Record export for police/small claims; no cash payout, stated honestly in the safety page copy.
5. Account deletion is self-serve in settings.

## Data model sketch

Catalog tables (synced, read-only to clients): `cards`, `card_variants`, `price_snapshots` (daily, per variant; compacted per the runway plan in the delivery research).
Trader tables: `traders` (profile, city_id, verified_at, `banned_at`, denormalized reputation counters), `cities`, `push_subscriptions`, `founders` (trader_id; membership granted only by migration, per [ADR-0007](adr/0007-admin-authorization.md)).
Inventory: `collection_entries` (trader, variant, condition, qty), `listings` (trader, variant, condition, photos, status: active / in_trade / traded / withdrawn; asking_price nullable), `wants` (trader, card, variant nullable, min_condition nullable).
Matching: a SQL view joining active `listings` x `wants` within a City, plus a `match_events` table so notifications fire once per new pair.
Trading: `trades` (proposer, recipient, status: proposed / accepted / scheduled / completed / cancelled / no_show, scheduled_at, safe_spot_id, completed_at), `trade_items` (trade, side, listing snapshot, cash_amount nullable), `messages` (trade, sender, body), `trade_feedback` (trade, from, to, thumb).
Safety: `safe_spots` (city, name, address, kind, notes), `verification_requests` (trader, document paths, status, reviewed_by/at), `reports`, `blocks`.

RLS posture: every table deny-by-default.
Reads are policy-scoped (own rows for private tables; city-scoped for listings/matches; participants-only for trades/messages; all rows for a Founder, via additive policies calling `is_founder()`).
All state changes go through named RPCs - `create_trade`, `counter_trade`, `accept_trade`, `schedule_meetup`, `complete_trade`, `cancel_trade`, `mark_no_show`, `leave_feedback`, `submit_verification`, `approve_verification` - or edge functions when side effects leave the database.
Ban and account deletion are edge functions rather than RPCs, because both must write `auth.users` through the Auth admin API, which a function running as the calling Trader cannot reach ([ADR-0007](adr/0007-admin-authorization.md)).
Every policy and RPC ships with a test proving what a foreign user cannot do.

## Architecture

- Backend: Supabase (Postgres + Auth + Realtime + Storage + edge/scheduled functions) with the write discipline above ([ADR-0001](adr/0001-supabase-write-discipline.md)).
- Frontend: Vite + React + TypeScript SPA, Tailwind, TanStack Query + TanStack Router, vite-plugin-pwa; deployed on Render free static hosting.
- Languages: TypeScript everywhere plus SQL/PL/pgSQL; Python only if the pre-planned FastAPI-on-Fly escape hatch ever fires.
- Price sync: scheduled function pulling TCGCSV daily (primary) with pokemontcg.io/TCGdex as catalog source and cross-check ([ADR-0003](adr/0003-price-data-sources.md)).
- Notifications: web push via self-generated VAPID keys; email via Resend, which also serves as Supabase Auth's custom SMTP, sending from a `mail.` subdomain with SPF/DKIM/DMARC ([ADR-0006](adr/0006-operational-vendors.md)).
- Domain and DNS: registered at Cloudflare Registrar with DNS hosted at Cloudflare, where the Render, Resend, and DMARC records all live ([ADR-0006](adr/0006-operational-vendors.md)).
- Error monitoring: Sentry (free Developer plan), covering the SPA and the edge functions ([ADR-0006](adr/0006-operational-vendors.md)).
- Backups and uptime: the Supabase free tier has no backups and pauses after 7 days of database inactivity, so a nightly GitHub Actions `pg_dump` job stores an encrypted dump and doubles as the keepalive ([ADR-0006](adr/0006-operational-vendors.md)).
- Listing photos: resized and re-encoded to WebP client-side before upload (1600px long edge, plus a 400px thumbnail for browse and Matches), with the storage bucket's own file-size and MIME limits as the enforcement a client cannot bypass.
- Search-engine visibility: the deployment is `noindex` from the first deploy until launch, since it is publicly reachable from build-sequence step 1 onward.
- Migrations-as-code via the Supabase CLI; the full stack runs locally (`supabase start`) for validation.
- Cost: $0/month at launch; first paid line is Supabase Pro ($25/month) only after real growth. The named triggers that precede it are Resend's 100 emails/day, Sentry's 5,000 errors/month, and the 1 GB storage ceiling described under Listing photos.

## Notification matrix

| Event | Push | Email |
|---|---|---|
| New Match | yes | no |
| New Trade proposal | yes | yes |
| Proposal accepted / countered | yes | yes |
| Meetup confirmed + reminder | yes | yes (confirm only) |
| Chat message | yes | no |
| Verification result | yes | yes |

## Testing decisions

Confirmed by the founders on 2026-08-22.
Implementation tickets cite these seams; a seam is the interface a test exercises a module through.
Three seams, chosen highest-first, with no test-only indirection layers.

1. **Database interface seam (primary).**
   Vitest suites using supabase-js clients signed in as seeded test Traders, run against the local stack (`supabase start`).
   This path exercises Auth (real JWTs), PostgREST, RLS, and the named RPCs exactly as the production client does.
   All business rules are tested here: the Trade state machine, Matching, Reputation counters, Trade Record immutability, and every policy/RPC's foreign-user denial test.
   pgTAP was considered and rejected as the primary seam: it runs below Auth/PostgREST (login claims must be simulated) and adds a second toolchain.
2. **Edge/scheduled function seam.**
   Functions whose side effects leave the database (price sync, web push, email) are invoked against the local stack with external HTTP faked at the network edge: recorded TCGCSV/catalog fixtures in, captured Resend/push requests out.
   Assertions are on database state and outbound calls.
3. **Browser seam (Playwright), kept thin.**
   One happy-path tracer per primary flow above, plus a PWA installability smoke check.
   Business rules are proven at seam 1; the browser tests prove wiring only.
   No component unit-test layer unless real client-side logic appears.

What makes a good test here:

- Two-Trader adversarial pairs are the default shape: the actor, the counterparty, and a foreign Trader in the same test file, asserting both what succeeds and what is denied.
- Real Postgres always; nothing below a seam is mocked.
  The only fakes anywhere sit at the external HTTP edge.
- Test names use the domain vocabulary of [CONTEXT.md](../CONTEXT.md) so the suite reads as this spec.

## Build sequence

1. Foundation: repo scaffold, Supabase project, migrations pipeline, CI, auth + profile + City.
2. Catalog: sync job, search picker, card page with Market Price.
3. Collection.
4. Listings + Wants (photo capture, storage).
5. Matching: view + match notifications (push/email infra lands here).
6. Trade state machine + chat (the heart).
7. Safety layer: verification + admin view, Safe Spot directory, completion/Trade Record, Reputation + Feedback.
8. Moderation + PWA polish: report/block/ban, account deletion, manifest/service worker, install onboarding.
9. Launch checklist: seed Safe Spots for the launch City; Discord funnel (#11); entity/legal (#12).

Each step is independently usable and testable; the heart lands at step 6 because proposals need listings, wants, and matches to exist.

## Open items

- Launch City: ticket #11.
- LLC and founder split: ticket #12.
