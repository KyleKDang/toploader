# Research: card price data sources and their costs at zero budget

Resolves GitHub issue #3 (wayfinder research ticket).
Sources are primary (official API docs, pricing pages, published terms, developer portals) unless explicitly labeled secondary.
Research date: 2026-08-11.

## Verdict summary

**Yes, a credible market-price feature is possible at $0-to-near-$0, with two honest caveats: "live" means daily-to-6-hourly (which is the industry standard for collection apps, not a compromise), and the $0 path runs on tolerated community redistribution of TCGplayer/Cardmarket data with no license and no SLA behind it.**
At ~1k users the realistic monthly cost is $0-6 on the community stack, $19-49 if the partner wants a commercially licensed feed, and +$49 only if graded-card (PSA/BGS/CGC) prices become a must-have.
User count barely matters to data cost: the correct architecture syncs prices into the app's own database on a schedule and serves users from there, so upstream usage scales with the ~20k-card catalog, not with users.

**Finding 1 (structural): every first-party door is closed to new developers.**
TCGplayer's developer docs state "We are no longer granting new API access at this time" ([TCGplayer getting started](https://docs.tcgplayer.com/docs/getting-started)).
Cardmarket's help center states "Currently, we are not accepting applications for access to the Cardmarket API" ([Cardmarket API help](https://help.cardmarket.com/en/cardmarket-api)).
eBay's Marketplace Insights API (90-day sold-item history) is a Limited Release API restricted to approved partners and not open to new users ([eBay Marketplace Insights overview](https://developer.ebay.com/api-docs/buy/marketplace-insights/overview.html); denial experiences corroborated in [eBay's developer community](https://community.ebay.com/t5/eBay-APIs-Talk-to-your-fellow/Marketplace-Insights-API-access/td-p/34838736), secondary).
A first-party licensed price feed therefore does not exist at any price a 2-person team can pay; everything below is either community redistribution or third-party aggregation.

**Finding 2 (kill-level for the direct TCGplayer path, even hypothetically): TCGplayer's API terms ban exactly this app.**
The API Terms and Conditions prohibit using the data to "develop, promote, or enable any product, application, or service similar to or that competes with TCGplayer's current or planned offerings," prohibit combining TCGplayer pricing data with other pricing data, and reserve termination "at any time for any reason" ([TCGplayer API Terms and Conditions](https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions)).
TCGplayer is owned by eBay (acquisition completed October 31, 2022 for up to ~$295M; [eBay press release](https://investors.ebayinc.com/investor-news/press-release-details/2022/eBay-Acquires-TCGplayer/default.aspx)), so a marketplace app competes with the data owner twice over.
Scraping TCGplayer directly is separately prohibited: "You agree not to crawl, scrape or spider any of our websites without express permission from us" ([TCGplayer Terms of Service](https://help.tcgplayer.com/hc/en-us/articles/205004918-Terms-of-Service)).
Ruled out; and this taints the provenance of every free source below, because they all republish TCGplayer numbers.

**Finding 3: the viable $0 stack is pokemontcg.io + TCGdex + TCGCSV, and it is genuinely good, but it is a revocable dependency.**
pokemontcg.io serves 20k+ cards with TCGplayer (USD) and Cardmarket (EUR) price blocks, free API keys, and 20,000 requests/day ([rate limits](https://docs.pokemontcg.io/getting-started/rate-limits); [card object](https://docs.pokemontcg.io/api-reference/cards/card-object)).
TCGdex is free with no API key, no published rate limits, and hourly-to-daily TCGplayer plus daily Cardmarket prices in every card response ([TCGdex markets integration](https://tcgdex.dev/markets-prices); [FAQ](https://tcgdex.dev/faq)).
TCGCSV publishes daily bulk CSV/JSON dumps of TCGplayer prices for free, "sourced directly from TCGplayer's API" ([TCGCSV](https://tcgcsv.com/); [FAQ](https://tcgcsv.com/faq)).
All three are community projects (donation/Patreon funded, small or single-maintainer teams) republishing prices that TCGplayer's own terms say may not be distributed; they survive on tolerance, exactly like the card-image posture from issue #5.
pokemontcg.io has documented reliability wobbles: a January 2026 outage report with 504s is still open, with users advised to fall back to the raw data on GitHub ([pokemon-tcg-data issue #609](https://github.com/PokemonTCG/pokemon-tcg-data/issues/609)).
The mitigation is architectural and free: sync into your own database daily, keep the last-good snapshot forever, and treat any one upstream as swappable.

**Finding 4: a licensed commercial feed exists at hobby prices if the tolerance risk is unacceptable: JustTCG at $19-49/month.**
JustTCG sells a TCG price API with a commercial license on paid tiers, 6-hour price refreshes, 20k+ Pokemon cards with condition and variant pricing, and explicit permission to build a paid user-facing product; its ToS prohibits only reselling raw data or building a competing pricing API, not building a marketplace ([JustTCG pricing](https://justtcg.com/pricing); [JustTCG terms](https://justtcg.com/terms)).
Its free tier (1,000 calls/month) is personal, non-commercial use only, so the $0 path cannot legally run production on it ([JustTCG terms](https://justtcg.com/terms)).
A daily full-catalog sweep of ~20k cards at 100 cards/request is ~200 calls/day (~6,000/month), which fits the $19/month Starter tier; 6-hourly refreshes need the $49/month Professional tier ([JustTCG pricing](https://justtcg.com/pricing)).

**Finding 5: graded-card prices (PSA 10 vs raw) are the one real coverage gap at $0.**
All the free sources carry raw (ungraded) marketplace prices only ([pokemontcg.io card object](https://docs.pokemontcg.io/api-reference/cards/card-object); [TCGdex markets](https://tcgdex.dev/markets-prices)).
Grade-level prices (Ungraded, Grade 7-9.5, PSA 10, BGS 10) computed from eBay sold listings are PriceCharting's specialty, and API plus daily CSV access requires their $49/month Legendary subscription ([PriceCharting methodology](https://www.pricecharting.com/page/methodology); [API docs](https://www.pricecharting.com/api-documentation); [subscription tiers](https://www.pricecharting.com/pricecharting-pro)).
Scrydex also sells graded prices and population reports from $29/month with no free tier ([Scrydex pricing](https://scrydex.com/pricing)).
The MVP answer is to ship raw prices and label them as such; adult collectors know the difference, and the gap is disclosed rather than hidden.

**Finding 6: "live" prices and stock-style charts need reframing, not more money.**
No source at any small-scale price offers tick-level prices; the market itself reprices daily-ish (TCGplayer market price is a computed daily-granularity figure, Cardmarket publishes 1/7/30-day averages; [pokemontcg.io card object](https://docs.pokemontcg.io/api-reference/cards/card-object)).
For portfolio charts, store your own daily snapshots from day one (free, and standard practice), and backfill history from TCGCSV's downloadable price archives which run from February 8, 2024 onward ([TCGCSV FAQ](https://tcgcsv.com/faq)).
pokemontcg.io has no history endpoint; JustTCG's history is on paid tiers with 30/90-day access still "coming soon" ([JustTCG homepage](https://justtcg.com/)); Scrydex charges 3 credits per price-history call ([Scrydex pricing](https://scrydex.com/pricing)).

---

## Source-by-source findings

### TCGplayer API (owned by eBay)

Status: closed to new developers.
The developer portal's getting-started page states "We are no longer granting new API access at this time," with existing users bound by terms including "important restrictions and attributions" ([getting started](https://docs.tcgplayer.com/docs/getting-started)).
A stale help-center article still advertises "pre-built APIs available for use in your website/app" with affiliate commissions ([help article](https://help.tcgplayer.com/hc/en-us/articles/201577976-How-can-I-get-access-to-your-card-pricing-data)), but the developer docs are the operative statement, and secondary coverage uniformly reports the application pipeline as dead since the eBay era ([CardGrader on TCGplayer API alternatives](https://cardgrader.ai/blog/tcgplayer-api-alternatives), secondary).
Terms even for holders: TCGplayer must be identified as the source with a link to the product page, the badge "This product uses TCGplayer data but is not endorsed or certified by TCGplayer" must be shown, pricing data may not be combined with other pricing data or distributed, and competing products are prohibited outright ([API Terms and Conditions](https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions)).
Ownership: eBay completed its acquisition of TCGplayer on October 31, 2022 ([eBay Inc. press release](https://investors.ebayinc.com/investor-news/press-release-details/2022/eBay-Acquires-TCGplayer/default.aspx)).
Verdict: ruled out directly; its prices reach this app only through the community redistributors below.

### Pokemon TCG API (pokemontcg.io)

Coverage: 20k+ English cards and all sets, with per-card TCGplayer price blocks (low/mid/high/market/directLow across normal, holofoil, reverseHolofoil, 1stEdition variants, in USD) and Cardmarket blocks (trend, low, and 1/7/30-day sale averages including reverse-holo series, in EUR), each with a daily-granularity updatedAt stamp ([card object](https://docs.pokemontcg.io/api-reference/cards/card-object)).
Cost: free; API keys are issued free at the [developer portal](https://dev.pokemontcg.io), and the project is donation-funded via Patreon/Kofi ([rate limits](https://docs.pokemontcg.io/getting-started/rate-limits)).
Rate limits: 20,000 requests/day with a key (negotiable upward), 1,000/day and 30/minute without ([rate limits](https://docs.pokemontcg.io/getting-started/rate-limits)).
A full catalog sweep at the maximum 250 cards/page is roughly 80-100 requests, so a daily sync consumes under 1% of the free quota.
Freshness and maintenance: the underlying open data repo is actively maintained, with 2026 sets landing within weeks of release (Pitch Black added 2026-07-17; [pokemon-tcg-data commits](https://github.com/PokemonTCG/pokemon-tcg-data/commits/master)).
Reliability: a January 2026 "endpoint seems to be down" issue remains open, describing 504s and delays, with users migrating to the GitHub JSON as fallback ([issue #609](https://github.com/PokemonTCG/pokemon-tcg-data/issues/609)); the card-and-set data is mirrorable from GitHub but the price blocks exist only on the live API.
ToS: no published license terms for the price data; the project is explicitly unaffiliated with Nintendo/TPCi (consistent with the issue #5 posture) and its TCGplayer price redistribution is tolerated, not licensed.
Verdict: viable as the $0 catalog-plus-prices backbone, treated as revocable.

### TCGdex

Coverage: multilingual (10+ languages) Pokemon card database with REST and GraphQL, open source, including a markets integration that embeds TCGplayer (USD, hourly-to-daily updates) and Cardmarket (EUR, daily updates) prices in every card response ([TCGdex](https://tcgdex.dev/); [markets integration](https://tcgdex.dev/markets-prices)).
Cost and limits: "free to use and requires no API key," with "no published hard rate limits, but please be considerate" and a request to cache locally for bulk needs ([FAQ](https://tcgdex.dev/faq)).
Fields: Cardmarket average/low/trend plus 1/7/30-day averages; TCGplayer low/mid/high/market/directLow across variants; cards absent from a marketplace simply omit that provider ([markets integration](https://tcgdex.dev/markets-prices)).
ToS: no published license terms for the price data; pricing accuracy is self-described as "actively being improved" ([FAQ](https://tcgdex.dev/faq)).
Verdict: viable free redundancy for pokemontcg.io and the fresher TCGplayer feed of the two; same tolerated-provenance caveat.

### TCGCSV

What it is: free daily bulk CSV/JSON dumps of TCGplayer categories, products, and prices (Pokemon included), updating around 20:00 UTC, run by one developer (CptSpaceToaster) and funded by Patreon ([TCGCSV](https://tcgcsv.com/); [FAQ](https://tcgcsv.com/faq)).
Provenance: "The cached files and JSON responses are sourced directly from TCGplayer's API (They just might be ~24 hours old)" ([FAQ](https://tcgcsv.com/faq)).
History: downloadable daily price archives from February 8, 2024 onward, which is the only free backfill for portfolio charts found in this research ([FAQ](https://tcgcsv.com/faq)).
ToS: none published; the FAQ asks for an identifiable User-Agent and gentle request pacing ([FAQ](https://tcgcsv.com/faq)).
Verdict: the best $0 bulk-price source; a one-file-per-day download makes the app independent of anyone's rate limits, but it is a single volunteer redistributing data TCGplayer's terms say may not be distributed, so assume it can vanish.

### Cardmarket (EU)

Status: "Currently, we are not accepting applications for access to the Cardmarket API," with existing credentials non-shareable and revocable ([Cardmarket API help](https://help.cardmarket.com/en/cardmarket-api)).
Even if open, Cardmarket prices are EUR and reflect the European market, which is the wrong reference price for a US local-trading app.
Verdict: ruled out directly; its trend/average price points arrive for free via pokemontcg.io and TCGdex as a secondary reference.

### JustTCG

Coverage: 18+ TCGs, 279k+ cards and 1M+ variants total, Pokemon at 20k+ cards, with condition-specific and variant (foil, alt art, promo) pricing; prices refresh every 6 hours and blend online marketplace data with point-of-sale reports from partner stores ([JustTCG](https://justtcg.com/)).
Tiers: Free $0 (1,000 calls/month, 100/day, 20 cards/request), Starter $19/month (10k calls/month), Professional $49/month (50k), Enterprise $149/month (500k) ([pricing](https://justtcg.com/pricing)).
ToS: free tier is personal non-commercial only; paid tiers carry a commercial license permitting user-facing paid products, server-side caching, and derived metrics; prohibited are reselling raw data and building "a pricing API or other product that serves as a substitute for or competitor to the Service"; attribution appreciated but not required on paid tiers; no accuracy warranty ([terms](https://justtcg.com/terms)).
A card marketplace/trading app is not a competing pricing API, so this is the cleanest licensed path found.
Gaps: no graded prices; price history depth still maturing (30/90-day access "coming soon"; [JustTCG](https://justtcg.com/)).
Verdict: the de-risk upgrade path at $19-49/month, not needed on day one.

### PriceCharting

Coverage: video games, trading cards (Pokemon included), comics, and coins, with the standout being grade-level prices: Ungraded, Grade 7, 8, 9, 9.5, PSA 10, BGS 10, computed from eBay sold listings and their own marketplace via an outlier-filtered algorithm ([methodology](https://www.pricecharting.com/page/methodology)).
Access and cost: "APIs are a premium tool. You must have a paid subscription"; API access and full CSV price-list downloads are features of the Legendary tier at $49/month (the $6/month Collector tier does not include API access) ([API docs](https://www.pricecharting.com/api-documentation); [subscription tiers](https://www.pricecharting.com/pricecharting-pro)).
Limits and freshness: API throttled to 1 call/second with revocation for abuse; CSVs regenerate every 24 hours and may be fetched at most every 10 minutes; the API serves current values only, no historic prices ([API docs](https://www.pricecharting.com/api-documentation)).
ToS: the public docs and FAQ state no explicit commercial-use license terms beyond the subscription, and the Legendary tier is marketed for integration "into your retail tools" ([subscription tiers](https://www.pricecharting.com/pricecharting-pro)); written confirmation of marketplace-app use should be obtained before building on it.
Verdict: the only commodity-priced graded-price source; defer until graded prices are actually demanded, then $49/month.

### Scrydex

Tiers: Starter $29/month (5k credits), Growth $99/month (50k), Professional $399/month (250k), Enterprise custom; no free tier; most requests cost 1 credit, price history 3 credits ([Scrydex pricing](https://scrydex.com/pricing)).
Coverage: Pokemon plus MTG, Lorcana, One Piece and others, with raw prices, graded prices (PSA, BGS, CGC, TAG, ACE), population reports, and price trends on all tiers ([Scrydex pricing](https://scrydex.com/pricing)).
Verdict: credible paid alternative combining raw plus graded in one API, but $29/month minimum with credit math that gets tight on daily full-catalog syncs; second choice behind JustTCG (raw) or PriceCharting (graded).

### Other sources checked and set aside

eBay Marketplace Insights API: 90-day sold-item history, Limited Release, requires business approval, and is not accepting new applicants ([overview](https://developer.ebay.com/api-docs/buy/marketplace-insights/overview.html); community denials in [eBay developer forums](https://community.ebay.com/t5/eBay-APIs-Talk-to-your-fellow/Marketplace-Insights-API-access/td-p/34838736), secondary); ruled out.
Scraping eBay sold listings directly: prohibited by eBay's user agreement the same way TCGplayer's ToS prohibits scraping, and eBay is the direct marketplace competitor; ruled out (structural observation; the TCGplayer clause is quoted above).
PSA public API: free cert-verification lookups by cert number, no price data ([PSA public API documentation](https://www.psacard.com/publicapi/documentation)); its free tier is reported at ~100 calls/day ([CardGrader PSA API guide](https://cardgrader.ai/blog/psa-api), secondary); useful later for verifying graded slabs in listings, not for pricing.
PokemonPriceTracker: aggregator with a $0 tier (100 credits/day), but commercial use requires the $99/month Business plan and free/API tiers are personal-use only ([API page](https://www.pokemonpricetracker.com/pokemon-card-price-api)); dominated by JustTCG on both price and terms.
Collectr, Card Ladder, and similar consumer portfolio apps expose no public developer API and were not evaluated further.

---

## ToS exposure of using this data inside a competing marketplace app

The uncomfortable truth: the entire free tier of this ecosystem is TCGplayer's data, redistributed by volunteers, consumed by apps that TCGplayer's own API terms would forbid.
The app never signs those terms (it has no TCGplayer key), so the exposure is not breach of contract; it is the platform risk that eBay/TCGplayer chokes off the redistributors (pokemontcg.io, TCGdex, TCGCSV) and the free feed dies with them.
Years of open operation and the industry-wide practice (every tracker app shows TCGplayer market prices) demonstrate tolerance, exactly parallel to the card-image posture in [payments-legal-trust.md](payments-legal-trust.md), but tolerance is not a license.
The mitigations are cheap: sync into your own database so the app survives upstream loss with stale-but-working prices, label the price source honestly in the UI, keep JustTCG's $19-49/month commercial license as the pre-planned fallback, and do not market the app as a TCGplayer-data product.
On branding exposure (issue #5 tie-in): pokemontcg.io and TCGdex are unofficial community projects that disclaim Nintendo/TPCi affiliation, so consuming them adds no trademark exposure beyond the already-flagged tier-2 card-image risk, provided the app's own branding stays neutral; the TCGplayer attribution-badge requirement applies only to actual API licensees and is moot here.
JustTCG and PriceCharting attach no Pokemon-branding strings; JustTCG requires no attribution on paid tiers ([JustTCG terms](https://justtcg.com/terms)).

## Cost model at ~1k users

Architecture assumption: a scheduled server job syncs prices into the app's own database (daily at $0, 6-hourly if paid), and users read from that database; upstream cost therefore scales with the ~20k-card catalog, not with user count, and 1k versus 10k users is the same data bill.

- Zero-budget stack: TCGCSV daily bulk download as primary, pokemontcg.io (free key, 20k req/day) and TCGdex (free, no key) as catalog and cross-check, own daily snapshots for history: $0/month data cost, $0-6/month total if a small VPS is used instead of free hosting tiers.
- Licensed stack: JustTCG Starter $19/month for daily syncs or Professional $49/month for 6-hourly ([JustTCG pricing](https://justtcg.com/pricing)): $19-49/month.
- Graded add-on, only if demanded: PriceCharting Legendary $49/month ([subscription tiers](https://www.pricecharting.com/pricecharting-pro)) or Scrydex from $29/month ([Scrydex pricing](https://scrydex.com/pricing)).

## What this means for the two MVP shapes

For shape (ii), local-first trading with a portfolio, the feature survives the kill-test: daily raw-market prices for every Pokemon card at $0/month, portfolio charts built from own snapshots plus TCGCSV backfill, with an honest "prices updated daily from marketplace data" label instead of a false "live" promise.
For shape (i), the payments marketplace, the same data works, but the ToS analysis above sharpens issue #5's economics finding: the marketplace would be competing against eBay/TCGplayer using price data that ultimately originates from eBay/TCGplayer, on tolerance, which is a strategic dependency on the competitor being attacked.
The one promise that must not be made in either shape is real-time or guaranteed-accurate pricing: every source in this research disclaims accuracy, updates at daily-ish cadence, and can be revoked; the feature is "market reference prices," and marketed that way it costs approximately nothing.
