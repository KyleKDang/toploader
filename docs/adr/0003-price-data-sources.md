# Price data from tolerated community sources, synced into our own database

Every first-party price API (TCGplayer, Cardmarket, eBay) is closed to new developers, so the app deliberately builds on community redistributors of TCGplayer data: TCGCSV daily bulk files as the price primary, pokemontcg.io and TCGdex as catalog source and cross-check.
These are unlicensed, tolerated, revocable dependencies run by volunteers - accepted with open eyes because the mitigation is architectural and free: a scheduled job syncs into our own Postgres daily, the last-good snapshot is kept forever, and any one upstream is swappable.
Full analysis in [docs/research/price-data-sources.md](../research/price-data-sources.md).

## Consequences

- The app survives any upstream outage with stale-but-working prices.
- JustTCG ($19/month, explicit commercial license) is the pre-planned licensed fallback; PriceCharting ($49/month) only if graded prices become a must.
- Prices are labeled "updated daily" in the UI; "live" is never promised. Raw (ungraded) prices only in v1.
- The app is never marketed as a TCGplayer-data product, and price snapshots are compacted (changed-only or weekly aggregates after 90 days) to preserve the free-tier storage runway.
