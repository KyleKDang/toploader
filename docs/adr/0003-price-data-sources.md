# Price data from tolerated community sources, synced into our own database

Every first-party price API (TCGplayer, Cardmarket, eBay) is closed to new developers, so the app deliberately builds on community redistributors of TCGplayer data: TCGCSV daily bulk files as the price primary, pokemontcg.io and TCGdex as catalog source and cross-check.
These are unlicensed, tolerated, revocable dependencies run by volunteers - accepted with open eyes because the mitigation is architectural and free: a scheduled job syncs into our own Postgres daily, the last-good snapshot is kept forever, and any one upstream is swappable.
Full analysis in [docs/research/price-data-sources.md](../research/price-data-sources.md).

## Consequences

- The app survives any upstream outage with stale-but-working prices.
- JustTCG ($19/month, explicit commercial license) is the pre-planned licensed fallback; PriceCharting ($49/month) only if graded prices become a must.
- Prices are labeled "updated daily" in the UI; "live" is never promised. Raw (ungraded) prices only in v1.
- The app is never marketed as a TCGplayer-data product, and price snapshots are compacted (changed-only or weekly aggregates after 90 days) to preserve the free-tier storage runway.

## Amendment, 2026-09-19 (ticket #14)

Building the sync settled three things this ADR left open.

- TCGCSV is the only upstream pulled daily.
  Its files carry the Cards, Variants, images, and prices, so a second daily source would double the exposure to volunteer-run upstreams in exchange for a fuzzy join (set name plus collector number) whose mismatches nothing would act on.
  pokemontcg.io and TCGdex remain the named swap-in sources.
  What "cross-check" guarded against is handled by integrity guards instead: a set is rejected, and its last-good data kept, when its response is not a success, when it arrives dated before the last sync, or when its Card count collapses to under half of what we hold.
- The sync is a scheduled GitHub Actions job, not an edge function.
  Parsing roughly 440 files does not fit the free tier's 2 seconds of CPU per call, and splitting it per set would need a queue, pg_cron, and a function-deploy pipeline to do what one process does without them.
- Compaction is both halves of the posture from day one: snapshots are changed-only, and rows older than 90 days are thinned to the last of each week by the same run.
  Changed-only alone was estimated at up to 300 MB a year.
  Every Catalog row is keyed by our own id with TCGplayer's id as a unique column, which is what makes "any one upstream is swappable" true in the schema.
