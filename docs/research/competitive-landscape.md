# Research: competitive landscape kill-test for a Pokemon card marketplace

Resolves GitHub issue #2 (wayfinder research ticket).
Sources are primary (official sites, published fee schedules, app-store listings, company help docs, press releases) unless explicitly labeled secondary.
Research date: 2026-08-11.

## Verdict summary

This ticket is a kill-test of the founding premise: "there isn't really any app dedicated towards buying and selling only Pokemon besides eBay and OfferUp."
The premise is factually false, in several independent ways.

**Kill 1: dedicated TCG and even Pokemon-only marketplaces already exist at every scale.**
TCGplayer is a dedicated trading-card marketplace, is the category incumbent, and has been owned by eBay itself since October 2022 ([eBay acquisition press release](https://investors.ebayinc.com/investor-news/press-release-details/2022/eBay-Acquires-TCGplayer/default.aspx)).
Double Holo is literally the product the premise says does not exist: a Pokemon-only peer-to-peer marketplace app on both app stores, launched March 2026, charging a 4.9% seller fee ([doubleholo.com](https://doubleholo.com/); [App Store listing](https://apps.apple.com/us/app/double-holo-card-marketplace/id6759494054)).
CardTrader and Cardmarket are dedicated TCG marketplaces dominant in Europe ([CardTrader fees page](https://static.cardtrader.com/en/pages/payments-fees-and-refunds); [Cardmarket](https://www.cardmarket.com/en)).
CollX is a card-scanner-plus-marketplace with 4.5M users that covers Pokemon ([CollX marketplace FAQ](https://collx.app/marketplace-faq); [TechCrunch on its $10M raise](https://techcrunch.com/2025/03/07/collx-raises-10m-to-grow-its-card-collection-marketplace), secondary).

**Kill 2: the "0% seller fees" wedge is already occupied at scale, and the one large-scale experiment in it was reversed.**
Courtyard, a Pokemon-dominant vaulted marketplace, advertises 0% seller fees and was reported at roughly $78M in Pokemon secondary volume in its record month of August 2025 ([Courtyard App Store listing](https://apps.apple.com/us/app/-/id6748155184); [Forbes](https://www.forbes.com/sites/boazsobrado/2026/06/04/the-cherry-on-the-cake-cryptos-rich-buy-pokmon-cards-over-picassos/), secondary).
Fanatics Collect eliminated seller fees for sellers who take payout in FanCash store credit ([SI coverage](https://www.si.com/collectibles/fanatics-collect-eliminates-seller-fees-new-fancash-payouts-program), secondary; standard cash fees are 6-12% per [Fanatics Collect's own fee announcement](https://www.fanaticscollect.com/newsroom/introducing-simpler-fees-for-sellers-in-the-new-buy-now-marketplace)).
Alt charges 0% seller fees on auctions ([Alt help center](https://support.alt.xyz/en/articles/9213521-selling-in-alt-auctions)).
Mercari ran the definitive experiment: it dropped seller fees to zero in March 2024, found that shifting cost to buyers "reduced overall transactions on the marketplace," and reinstated a 10% seller fee in January 2025 ([Mercari's own FAQ on the reversal](https://www.mercari.com/us/help_center/article/2518/)).
Zero seller fees is not an unclaimed wedge; it is a subsidy incumbents already deploy, and it failed as a standalone strategy at Mercari scale.

**Kill 3: trust and no-scam mechanics are the incumbents' strongest moat, not their gap.**
eBay routes every single trading card sold for $200+ through physical authentication by PSA at eBay's expense ([eBay Authenticity Guarantee](https://www.ebay.com/authenticity-guarantee/tradingcards)).
Courtyard holds every card it sells in insured Brink's vaults ([Courtyard Series A blog post](https://courtyard.io/blog/post/courtyard-io-raises-30-million-series-a-to-reimagine-collecting-71e8c1e9ef05)).
Fanatics Collect runs its own vault with a 1% fulfillment fee on withdrawal ([Fanatics Collect vault help doc](https://help.fanaticscollect.com/hc/en-us/articles/19008715653661-The-Vault)).
These are capital-intensive solutions a 2-person $500-1k team cannot imitate, which is consistent with issue #5's finding that the "100% no-scam guarantee" must be reframed as safety mechanics.

**Survives: nobody owns app-facilitated in-person/local TCG trading.**
Play! Pokemon owns organized play (leagues and events at local stores) but is a tournament program, not a trading marketplace ([Play! Pokemon](https://www.pokemon.com/us/play-pokemon/); [event locator](https://events.pokemon.com/en-us/)).
OfferUp owns generic local-commerce safety infrastructure, and in September 2025 it retreated to local-only by ending nationwide shipping entirely ([OfferUp: nationwide shipping ending](https://help.offerup.com/hc/en-us/articles/41043186552980-Nationwide-shipping-ending)).
The TCG-specific local-trading attempts that exist (CardChase, Cardichu, Collect 'n Connect) are embryonic, with no visible scale ([cardchase.org](https://cardchase.org/); [cardichu.com](https://cardichu.com/); [collectnconnect.app](https://collectnconnect.app/)).
The narrowed premise "no one owns local, in-person Pokemon trading in an app" survives the evidence, with heavy caveats detailed under question (c).

---

## Category incumbents: eBay and TCGplayer

eBay is not one competitor but a portfolio.
It bought TCGplayer, the dedicated TCG marketplace, for up to ~$295M in October 2022 ([press release](https://investors.ebayinc.com/investor-news/press-release-details/2022/eBay-Acquires-TCGplayer/default.aspx)).
It bought Goldin, the leading collectibles auction house, in 2024, in the same deal that sold the eBay Vault to PSA while keeping vault services integrated for eBay customers ([press release](https://investors.ebayinc.com/investor-news/press-release-details/2024/eBay-Collectors-Enter-into-Commercial-Agreement-Sign-Deals-for-Acquisition-of-Goldin-by-eBay-and-Acquisition-of-the-eBay-Vault-by-PSA/default.aspx)).
Its Authenticity Guarantee routes single trading cards sold at $200+ through PSA inspection at eBay's cost ([program page](https://www.ebay.com/authenticity-guarantee/tradingcards)).
eBay's final value fee for trading cards is 13.25% of the total sale up to $7,500 (2.35% above), plus a $0.30-0.40 per-order fee ([eBay selling fees help page](https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822); the page resisted automated retrieval during research, and the figures are corroborated by trading-card fee calculators such as [tcgfeecalc.com](https://tcgfeecalc.com/ebay), secondary).
TCGplayer charges sellers a 10.75% commission (raised from 10.25% effective February 10, 2026) plus 2.5% + $0.30 processing ([TCGplayer fee schedule](https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees)).
Strengths: liquidity, price discovery (TCGplayer market price is the de facto reference price), authentication at scale, and buyer protection.
Gaps: fees are the highest in the landscape, selling has onboarding friction, and neither property does anything for in-person trading.

## Live commerce: Whatnot, Fanatics Live, Loupe, Drip Shop Live

Whatnot is the dominant live-shopping marketplace and is card-native: it reported more than $8B in 2025 GMV, more than double 2024, with over 20M new accounts in 2025 ([cllct summarizing Whatnot's own report](https://www.cllct.com/sports-collectibles/memorabilia/whatnot-doubled-sales-to-more-than-8-billion-in-2025), secondary).
Sports cards are its No. 1 US category with trading card games right behind ([Sports Collectors Daily on Whatnot's 2026 report](https://www.sportscollectorsdaily.com/whatnot-report-shows-sports-cards-remain-a-core-driver-as-live-commerce-expands-globally/), secondary).
It raised a $545M Series G at a $20B valuation in August 2026 ([Tubefilter](https://www.tubefilter.com/2026/08/07/whatnot-series-g-funding-round-545-million-live-shopping/), secondary).
Seller fees: 8% commission plus 2.9% + $0.30 payment processing ([Whatnot seller fees help doc](https://help.whatnot.com/hc/en-us/articles/4847069165965-Whatnot-seller-fees)).
Fanatics Live is Fanatics' live-breaking app (launched 2023) with heavy Pokemon representation and self-serve "Instant Rips" ([about.fanatics.live](https://about.fanatics.live/post/introducing-instant-rips-the-future-of-breaking); [Pokemon category page](https://www.fanatics.live/category/pokemon)).
Loupe, an earlier live-breaks app ($3M seed in 2020, [Sports Collectors Digest](https://sportscollectorsdigest.com/news/loupe-tech-card-breaking-app), secondary), is still alive and updating as of May 2026 but sports-focused and niche ([Google Play listing](https://play.google.com/store/apps/details?id=com.loupetheapp.android&hl=en_US)).
Drip Shop Live is a live-shopping and pack-ripping marketplace covering Pokemon TCG and sports ([App Store listing](https://apps.apple.com/us/app/drip-shop-live-card-breaks/id1568026219)).
Strengths: entertainment-driven liquidity and the strongest seller-community flywheel in the hobby.
Gaps: nothing local, high combined fee load (~11% on Whatnot), and buying is impulse/entertainment-shaped rather than collection-shaped.

## Vaulted and tokenized 0%-fee marketplaces: Courtyard, Collector Crypt, Fanatics Collect, Alt

Courtyard tokenizes cards stored in insured Brink's vaults, sells gacha-style mystery packs with an instant ~90% buyback, and charges 0% marketplace fees; it raised a $30M Series A led by Forerunner in July 2025, reporting roughly $50M/month GMV at the time ([Courtyard blog](https://courtyard.io/blog/post/courtyard-io-raises-30-million-series-a-to-reimagine-collecting-71e8c1e9ef05); [Fortune](https://fortune.com/2025/07/24/exclusive-forerunner-leads-30-million-round-in-collectibles-marketplace-courtyard), secondary; [CoinGecko explainer](https://www.coingecko.com/learn/what-are-tokenized-pokemon-cards-tcg), secondary).
Its App Store listing claims 500K+ collectors and 0% seller fees ([App Store](https://apps.apple.com/us/app/-/id6748155184)).
Forbes reported ~$78.4M in Pokemon volume in its record month (August 2025) and that Solana-based competitor Collector Crypt had overtaken it in weekly revenue by June 2026 ([Forbes](https://www.forbes.com/sites/boazsobrado/2026/06/04/the-cherry-on-the-cake-cryptos-rich-buy-pokmon-cards-over-picassos/), secondary; [BeInCrypto on the tokenized-Pokemon surge](https://beincrypto.com/tokenized-pokemon-cards-rwa-popularity/), secondary).
Fanatics Collect (successor to PWCC) runs vault plus marketplace: 6% fees on Buy Now cards listed within 120% of estimated market value, 12% otherwise, 0% if the seller takes FanCash credit, and 1% vault fulfillment on withdrawal ([Fanatics Collect fee announcement](https://www.fanaticscollect.com/newsroom/introducing-simpler-fees-for-sellers-in-the-new-buy-now-marketplace); [vault help doc](https://help.fanaticscollect.com/hc/en-us/articles/19008715653661-The-Vault); [SI on FanCash payouts](https://www.si.com/collectibles/fanatics-collect-eliminates-seller-fees-new-fancash-payouts-program), secondary).
Alt is a graded-card marketplace with volume-tiered fixed-price fees (as low as 4% for top tiers, ~7% base) and 0% seller fees on auction proceeds ([Alt fees](https://support.alt.xyz/en/articles/9682168-alt-fees); [auction selling](https://support.alt.xyz/en/articles/9213521-selling-in-alt-auctions)).
Strengths: they have made "0% fees" and "never get scammed" table stakes for vaulted inventory, funded by float, packs, and adjacent revenue.
Gaps: cards must be shipped into a vault first (physical possession is surrendered), crypto rails alienate some collectors, and none of it addresses in-person trading.

## Dedicated TCG marketplaces: Double Holo, CardTrader, Cardmarket, CollX

Double Holo is the direct counterexample to the founding premise: a Pokemon-card marketplace app on iOS and Android with a 4.9% seller platform fee (minimum $1), free listing, card scanning, AI price forecasting, and a vendor hub ([doubleholo.com](https://doubleholo.com/); [Google Play](https://play.google.com/store/apps/details?id=com.doubleholo.mobile&hl=en_US)).
It is tiny and new: version 1.0 shipped in March 2026, and it shows 298 App Store ratings (4.6 stars) as of this research ([App Store listing](https://apps.apple.com/us/app/double-holo-card-marketplace/id6759494054)).
Its existence cuts both ways for this project: it kills the "nobody has built this" premise, and it demonstrates that two things are true at once - the app is buildable, and building it does not create liquidity (298 ratings five months in).
CardTrader (Italy) is a dedicated TCG marketplace whose CT Zero program consolidates multi-seller orders through its hub, with seller fees reported around 5-7% ([CardTrader fees page](https://static.cardtrader.com/en/pages/payments-fees-and-refunds); [CT Zero guide](https://static.cardtrader.com/en/guides/zero-guide); percentage corroboration via [Card Synced comparison](https://cardsynced.com/blog/card-synced-vs-cardtrader-marketplace-comparison), secondary).
Cardmarket is Europe's largest TCG marketplace, claiming 2M+ buyers across 30 countries, with commissions of 5% (private), 3% (professional), and 1.5% (powerseller) ([cardmarket.com](https://www.cardmarket.com/en); fee tiers corroborated via [fee calculators](https://flipzi.io/cardmarket-fee-calculator/), secondary); it does not serve US-domestic liquidity well.
CollX is a scan-first app (sports-first, now covering Pokemon, MTG, Yu-Gi-Oh, Lorcana) with an integrated marketplace charging a 10% commission with payment processing covered ([CollX marketplace FAQ](https://collx.app/marketplace-faq)); it reported ~4.5M users and raised $10M in March 2025 ([Technical.ly](https://technical.ly/entrepreneurship/collx-trading-card-marketplace-profitable/), secondary; [TechCrunch](https://techcrunch.com/2025/03/07/collx-raises-10m-to-grow-its-card-collection-marketplace), secondary).

## Generalist marketplaces: Mercari, OfferUp, Facebook Marketplace

Mercari charges a 10% seller fee plus a 3.6% buyer protection fee since January 6, 2025 ([Mercari fees](https://www.mercari.com/us/help_center/article/169/)).
The history matters more than the number: Mercari eliminated seller fees in March 2024, and its own FAQ states the zero-seller-fee structure "negatively impacted Mercari and the community by reducing overall transactions," forcing the January 2025 reversal ([Mercari FAQ](https://www.mercari.com/us/help_center/article/2518/); [Value Added Resource coverage](https://www.valueaddedresource.net/mercari-backtracks-on-fee-changes/), secondary).
OfferUp is now effectively local-only: nationwide shipping ended September 23, 2025, and in-person transactions carry no fees or commission ([nationwide shipping ending](https://help.offerup.com/hc/en-us/articles/41043186552980-Nationwide-shipping-ending); [What is OfferUp](https://help.offerup.com/hc/en-us/articles/360031989092-What-is-OfferUp)).
Its safety infrastructure is the best-in-class generic playbook: ~1,900 Community MeetUp Spots and TruYou ID verification ([OfferUp trust and safety](https://about.offerup.com/trust-safety-commitment)).
Facebook Marketplace is free for local pickup; shipped checkout orders carry a selling fee that doubled from 5% to 10% (minimum $0.80) on April 15, 2024 ([Meta Business Help Center fee page](https://www.facebook.com/business/help/223030991929920), login-gated; [Value Added Resource](https://www.valueaddedresource.net/facebook-marketplace-doubling-selling-fees/), secondary).
Strengths: free local liquidity at population scale; Facebook groups are where a large share of informal Pokemon trading already happens.
Gaps: no card database, no market prices, no condition/grading vocabulary, scam-prone chat, and no TCG-specific reputation; this is the texture the partner's complaint is actually about.

## Adjacent: Collectr, rip-and-ship gambling, and the dead

Collectr is the portfolio-tracking incumbent: 4M+ users, eight-figure ARR, tracking 600M+ items worth ~$1.5B ([BetaKit interview](https://betakit.com/how-collectr-bootstrapped-a-trading-card-hobby-into-an-eight-figure-business/), secondary; [App Store listing](https://apps.apple.com/us/app/collectr-tcg-collector-app/id1603892248)).
Its founders explicitly declined to build a marketplace ("why not let the experts that have been doing this for so long and do it really well continue to do it?") and monetize via subscriptions, ads, and affiliate links to eBay and TCGplayer (same BetaKit source, secondary).
That is simultaneously reassurance (the biggest TCG audience owner is not entering) and a standing threat (it could bolt local-trading features onto 4M users at any time).
PackDraw is an online mystery-pack site shipping real cards; reviewers report it operates without a gambling license, with an average house edge around 23%, and it faces live lawsuits including one alleging recruitment of a minor into offshore crypto gambling ([fairness.gg review](https://fairness.gg/reviews/packdraw/), secondary; [BetterChecked](https://www.betterchecked.com/review/packdraw-test-review), secondary).
The rip-and-ship category is real demand but regulatory-adjacent territory a compliance-poor team should not touch, consistent with issue #5's posture.
Dibbs, the Amazon-backed fractional card marketplace that raised $13M, shut its consumer marketplace in March 2023 and pivoted to B2B tokenization ([Darren Rovell](https://twitter.com/darrenrovell/status/1636091837906661378), secondary; [Boardroom profile of what it was](https://boardroom.tv/dibbs-fractional-trading-card-investment-platform/), secondary).
Its lesson: novel financial mechanics without collector-shaped demand die even with funding.
For completeness: the official Pokemon TCG Pocket app supports trading of digital cards only, not physical ones ([App Store listing](https://apps.apple.com/us/app/pok%C3%A9mon-tcg-pocket/id6479970832)).

## The local and meetup landscape (question b in detail)

Play! Pokemon is the official organized-play program: local leagues at Play! Pokemon stores, an event locator, and championships ([Play! Pokemon](https://www.pokemon.com/us/play-pokemon/); [event finder](https://events.pokemon.com/en-us/)).
It creates the physical gathering places where trading already happens, but it is TPCi's tournament infrastructure, not a trading product, and third parties cannot build on it.
Generic local commerce is owned by OfferUp and Facebook Marketplace as described above, including OfferUp's ~1,900 safe-exchange MeetUp Spots ([OfferUp trust and safety](https://about.offerup.com/trust-safety-commitment)).
Meetup hosts organic Pokemon-collecting groups ([Meetup TCG topic](https://www.meetup.com/topics/trading-card-games/)).
TCG-specific local products exist only in embryo:

- CardChase is the closest direct competitor to the approved meetup-first shape: in-person Pokemon trading at verified card shops and "Trainer Centers," reputation scores, guided safe chat, and parental controls for child accounts ([cardchase.org](https://cardchase.org/); [Google Play listing](https://play.google.com/store/apps/details?id=com.k2coach.cardchaseapp&hl=en_US)).
  No user counts, funding, or press coverage surfaced, its iOS distribution mentions TestFlight, and its positioning is family/kid safety rather than adult collector-investors.
- Cardichu lists local Pokemon trade shows and connects collectors and vendors regionally ([cardichu.com](https://cardichu.com/)).
- Collect 'n Connect is a card-show and meetup finder with social follows ([collectnconnect.app](https://collectnconnect.app/)).

The de facto owners of local Pokemon trading are free informal channels: local game stores, card shows, Facebook groups, and Discord servers.
No app has meaningful ownership of app-facilitated local TCG trading; equally, no funded team has judged it worth owning, and OfferUp's retreat from shipping shows local-only classifieds monetize thinly (OfferUp charges nothing on local deals and lives on promotions/ads).

## Fee comparison table

| Platform | Model | Seller-side cost | Source |
|---|---|---|---|
| eBay | Shipped marketplace + authentication at $200+ | 13.25% up to $7,500 + $0.30-0.40/order | [eBay selling fees](https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822) |
| TCGplayer | Dedicated TCG marketplace (eBay-owned) | 10.75% + 2.5% + $0.30 | [TCGplayer fees](https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees) |
| Whatnot | Live commerce | 8% + 2.9% + $0.30 | [Whatnot seller fees](https://help.whatnot.com/hc/en-us/articles/4847069165965-Whatnot-seller-fees) |
| Mercari | Generalist shipped | 10% seller + 3.6% buyer | [Mercari fees](https://www.mercari.com/us/help_center/article/169/) |
| Facebook Marketplace | Local + shipped | Local free; shipped 10% (min $0.80) | [Meta help](https://www.facebook.com/business/help/223030991929920); [VAR](https://www.valueaddedresource.net/facebook-marketplace-doubling-selling-fees/) (secondary) |
| OfferUp | Local-only since Sept 2025 | Local free | [OfferUp help](https://help.offerup.com/hc/en-us/articles/360031989092-What-is-OfferUp) |
| CardTrader | Dedicated TCG (EU hub) | ~5-7% | [CardTrader fees](https://static.cardtrader.com/en/pages/payments-fees-and-refunds) |
| Cardmarket | Dedicated TCG (EU) | 5% / 3% / 1.5% by tier | [Cardmarket](https://www.cardmarket.com/en) |
| CollX | Scanner + marketplace | 10%, processing covered | [CollX FAQ](https://collx.app/marketplace-faq) |
| Double Holo | Pokemon-only P2P app | 4.9% (min $1) | [doubleholo.com](https://doubleholo.com/) |
| Alt | Graded-card exchange | ~4-7% fixed price; 0% auctions | [Alt fees](https://support.alt.xyz/en/articles/9682168-alt-fees) |
| Fanatics Collect | Vault marketplace | 6-12% cash; 0% in FanCash; 1% vault withdrawal | [Fanatics Collect](https://www.fanaticscollect.com/newsroom/introducing-simpler-fees-for-sellers-in-the-new-buy-now-marketplace) |
| Courtyard | Tokenized vault marketplace | 0% | [App Store listing](https://apps.apple.com/us/app/-/id6748155184) |

---

## Answers to the ticket's questions

### (a) Is any app already a dedicated peer-to-peer Pokemon/TCG marketplace?

Yes, several, at three tiers.
The incumbent tier: TCGplayer is a dedicated TCG marketplace owned by eBay ([acquisition press release](https://investors.ebayinc.com/investor-news/press-release-details/2022/eBay-Acquires-TCGplayer/default.aspx)), and Cardmarket/CardTrader own Europe.
The venture tier: Courtyard (0% fees, tens of millions per month in Pokemon volume) and Collector Crypt are Pokemon-dominant marketplaces; CollX and Whatnot are card-native at multi-million-user scale.
The literal tier: Double Holo is a Pokemon-only peer-to-peer marketplace app, live on both app stores since March 2026 at a 4.9% fee ([App Store](https://apps.apple.com/us/app/double-holo-card-marketplace/id6759494054)).
The founding premise as stated is false and should be retired from the pitch.

### (b) Does anything own in-person/local trading and meetups for TCGs?

No app owns it.
Play! Pokemon owns the physical gathering layer (leagues, events) but is not a trading product ([Play! Pokemon](https://www.pokemon.com/us/play-pokemon/)).
OfferUp and Facebook Marketplace own generic local commerce, with zero TCG-specific features, and OfferUp has retreated to local-only ([shipping shutdown](https://help.offerup.com/hc/en-us/articles/41043186552980-Nationwide-shipping-ending)).
The only direct attempt, CardChase, targets the family/kid-safety angle at no visible scale ([cardchase.org](https://cardchase.org/)).
The honest reading is double-edged: the lane is open, and the lane being open despite an obvious idea and cheap tooling is itself evidence that liquidity is hard and local-only monetization is thin.

### (c) Where are the real gaps a 2-person zero-budget team could credibly occupy?

Not credible, killed by this landscape:

- Competing on fees: 0% already exists at scale (Courtyard, Fanatics Collect FanCash, Alt auctions), Mercari's own reversal shows 0% seller fees does not even buy durable growth ([Mercari FAQ](https://www.mercari.com/us/help_center/article/2518/)), and issue #5 already showed a 0%-fee payments marketplace loses money on every transaction and dispute.
- Competing on trust/anti-scam for shipped sales: eBay's PSA authentication and the vault marketplaces solve this with capital ([eBay Authenticity Guarantee](https://www.ebay.com/authenticity-guarantee/tradingcards)); a guarantee-led wedge is both unaffordable and already reframed as deceptive-risk in issue #5.
- Competing on liquidity, price data, or live commerce: TCGplayer/eBay own reference pricing, Whatnot owns entertainment liquidity at a $20B valuation ([Tubefilter](https://www.tubefilter.com/2026/08/07/whatnot-series-g-funding-round-545-million-live-shopping/), secondary).
- Rip-and-ship/gacha mechanics: demand is real but the segment is gambling-adjacent with live lawsuits ([fairness.gg](https://fairness.gg/reviews/packdraw/), secondary) and regulatorily radioactive for this team.

Credible, one lane: app-facilitated local trading for adult collector-investors, i.e. the already-approved shape (ii).
It is the only surveyed segment where no funded incumbent operates, where the incumbents' moats (payment rails, vaults, authentication labs, live video) confer no advantage, and where the compliance load fits the budget per issue #5 (~$130 plus entity formation).
The differentiators that survive contact with this landscape are specific: TCG-native trade tooling on top of the OfferUp safety playbook (card-level listings with TCGplayer-anchored market prices as negotiation context, want/have matching, documented in-app trade records, trader reputation, safe-spot directory), aimed at adults, since CardChase took the kids/family angle.

Conditions attached to that credibility, stated as kill-risks, not caveats to wave away:

- The gap may exist because it monetizes poorly: OfferUp keeps local free and just amputated its fee-bearing shipping business; a meetup app earns nothing per trade, so the business case must rest on later monetization (subscriptions a la Collectr, or v2 payments with fees), not on trading revenue.
- Liquidity is city-by-city: a trade app with no nearby counterparties is dead weight, so v1 must win one metro before it means anything, and the informal incumbents (Facebook groups, LGS nights, card shows) are free, entrenched, and good enough for most adults.
- Distribution overhang: Collectr (4M users) or Double Holo could add local-trading features on top of existing audiences at any time; Collectr's stated no-marketplace posture ([BetaKit](https://betakit.com/how-collectr-bootstrapped-a-trading-card-hobby-into-an-eight-figure-business/), secondary) softens but does not remove this.
- CardChase proves buildability, and its obscurity proves that building it earns nothing by itself; the scarce asset in this lane is a seeded local community, not code.

### Net verdict for the wayfinder

The founding premise ("nobody but eBay and OfferUp") is dead.
The partner's fee-and-guarantee wedge (0% fees + no-scam guarantee) is dead as a differentiator: both halves are already offered, at scale, by funded incumbents, and issue #5 independently killed the guarantee wording.
The meetup-first shape (ii) survives as the sole defensible lane, on the strength of a genuinely unowned niche, but its premise must be restated honestly: not "no competition exists," rather "the competition ignores in-person trading because it is hard to monetize, and we believe a community-first wedge is worth building there anyway."
The payments-marketplace shape (i) does not survive this landscape review as a v1 and should remain deferred.
