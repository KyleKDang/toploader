# Viability brief: the card-trading app

Prepared 2026-08-15 as the read-before-deciding document for Founder Questionnaire #2.
It folds five research reports and the Founder Questionnaire #1 answers into one picture.
The research was run as a kill-test: the agents' job was to kill the idea with evidence, not to sell it, so whatever survived is worth taking seriously.
Every claim below is backed by a cited source in the full write-ups: [competitive landscape](research/competitive-landscape.md), [payments and legal](research/payments-legal-trust.md), [price data](research/price-data-sources.md), [card scanning](research/card-scanning-feasibility.md), [delivery platforms](research/delivery-platforms.md).
Facts were checked against primary sources (fee schedules, laws, the companies' own pages) in August 2026.

## The bottom line

The idea as originally pitched does not survive the evidence.
The market we assumed was empty is crowded, the "0% fees plus a 100% no-scam guarantee" wedge is already offered at scale by funded companies, and the idea of us holding both sides' money ourselves is a federal crime without licenses that cost over a million dollars.

A narrower version does survive: **an app that organizes safe, in-person Pokemon card trades for adult collectors, city by city.**
No company owns that space.
Every technical piece of it is buildable for close to $0, and the legal weight fits the budget.

**Recommendation: go, but only for the meetup version, with the three changes listed below, and with the biggest weakness stated plainly: the app earns nothing per trade, so revenue has to come later, from subscriptions and eventually optional in-app payments that carry a small fee.**

## The scorecard

| Risk area | Verdict | What the evidence says |
|---|---|---|
| Competition | Fails as pitched; one lane open | Dedicated Pokemon marketplaces already exist at every size; only in-person local trading is unowned |
| Handling money ourselves | Fails | Holding both sides' cash is "money transmission" - a felony without state licenses costing $1M+; a licensed payment company must hold the funds instead |
| "100% no-scam guarantee" | Fails as worded | Advertising a guarantee we cannot pay out is deceptive advertising under FTC rules, and honoring one claim on a $500 card could eat the whole budget; reframe as a concrete safety program |
| Pokemon in the name | Fails | "Pokemon" is a trademark we have no license to; the app needs a neutral name plus a disclaimer, which is what every comparable app does |
| Card price data | Passes | Daily market prices for all ~20,000 cards at $0-6/month, with a licensed paid backup at $19-49/month if the free sources ever die |
| Card scanning | Cut from v1 | You ranked it last, free incumbent apps already ship it, and a fast card search does the v1 job; build it later with the portfolio feature |
| Building and running it | Passes | $0/month to launch as a mobile web app; $124 in year one when we later publish to the app stores |

## The competition, honestly

The founding premise - "there isn't really an app dedicated to buying and selling Pokemon cards besides eBay and OfferUp" - is false, in several independent ways:

- **TCGplayer** is a dedicated trading-card marketplace, sets the reference price the whole hobby quotes, and has been owned by eBay since 2022.
- **Double Holo** is exactly the product we thought didn't exist: a Pokemon-only buying-and-selling app, live on both app stores since March 2026, charging sellers 4.9%.
- **Courtyard** already runs **0% seller fees** on vaulted cards and peaked around $78M of Pokemon sales in a single month.
- **Whatnot** is a live-video shopping marketplace doing over $8B a year, with cards as its biggest category.
- **CollX** (~4.5M users) and **Collectr** (~4M users) own card scanning and collection tracking.

Worse, the two halves of our pitch are the incumbents' strengths, not their gaps:

- 0% seller fees already exists at scale, and the one big experiment in it failed: Mercari dropped seller fees to zero in 2024, transactions fell, and it reversed course within a year.
- Scam protection is where the big players spend the most money: eBay physically inspects every card over $200 with professional authenticators, and the vault marketplaces hold the actual cards in insured vaults.
  A two-person team cannot out-trust that with promises.

What nobody owns is **in-person, local trading**.
OfferUp and Facebook handle local sales generically, with no card database, no market prices, and no trader reputation; the only card-specific attempt (CardChase) is tiny and aimed at kids and parents, not adult collectors.
Honesty requires the flip side too: the lane is probably open because local trading is hard to make money on, which is exactly why the revenue plan matters (see the risks section).

## Three things that must change

1. **We can never hold people's money ourselves.**
   The v2 idea of the app holding both sides' cash until a trade completes is legally "money transmission."
   Doing it without registering federally and getting a license in nearly every state is a federal felony, and the licenses cost more than $1M nationwide.
   The legal way to deliver the same promise in v2: Stripe (the payment company behind most apps) holds the buyer's money and releases it to the seller only after delivery is confirmed.
   Same protection for users, zero licenses for us.
2. **Drop the words "100% guarantee."**
   A guarantee you advertise but cannot honor is deceptive advertising, with regulators attached, and with no payment records we could not even verify a claim; two colluding accounts could stage a "scam" and split our payout.
   What we ship instead is a named safety program with real mechanics: ID-verified traders, a directory of police-station safe-exchange spots, in-app trade records with photos and timestamps, and reputation scores.
3. **The app cannot be named or branded "Pokemon"-anything.**
   The word and the artwork are Nintendo/The Pokemon Company trademarks and they do enforce against branding-level uses.
   A neutral name with "for Pokemon TCG collectors" in the description and a visible non-affiliation disclaimer is the standard posture of every app in this space, and it costs nothing.

## The two versions, compared

| | Version A: marketplace with payments | Version B: meetup-first trading app |
|---|---|---|
| What it is | Buy and sell cards in-app; cards ship by mail; money moves through the app | List cards, match wants with haves, arrange safe in-person trades; no money moves through the app |
| Launch cost | Same near-$0 tech, but an LLC is non-negotiable | ~$60-510 one-time (mostly the LLC state fee) |
| Monthly cost | $0-6 plus payment losses (below) | $0-6 |
| Legal and admin weight | Heavy: seller identity checks, sales-tax collection duties in every state as it grows, IRS forms, disputes at $15 each | Light: ~$130 of filings and store fees plus the LLC; no financial regulation at all |
| The economics | At 0% seller fees we lose ~3% processing on every sale and eat every dispute; the "wedge" pays the costs the incumbents' 10-13% fees exist to cover | Earns nothing per trade by design; costs almost nothing to run |
| Competition faced | Head-on against eBay, TCGplayer, Double Holo, Courtyard, Whatnot | Effectively none today; the risk is a big player adding local features later |
| Differentiation | None that survives: 0% fees and buyer protection are already offered at scale | Real: nobody owns app-organized local trading for adult collectors |
| Biggest risk | Losing money on every transaction while fighting entrenched giants | Getting enough traders in one city for trades to actually happen |
| Verdict | **Defer to v2**, and only once fees exist to fund it | **Build this** |

## What version 1 would actually be

One city to start, because a trading app with no nearby traders is dead weight.

- Card-level listings and want-lists over the full ~20,000-card catalog, picked via fast search.
- Daily market prices shown on every card as negotiation context, labeled honestly as daily (that is the industry standard; nobody small has live prices).
- Meetup coordination: propose a trade, chat, agree a time at a safe spot from the directory.
- The safety program: verified IDs, safe-spot directory, documented trade records, reputation.
- A simple collection page; the full stock-style portfolio with charts comes later, and scanning comes with it.

Delivered as a mobile web app that installs to the home screen, at $0/month on free infrastructure.
When one city shows real traction, we pay $124 and publish to both app stores, which also unlocks reliable iPhone notifications (the one real limit of the web version).

## The budget

| Item | Cost |
|---|---|
| Forming an LLC (shields us from personal liability) | $50-500 depending on state |
| Copyright takedown agent filing (a legal-safe-harbor requirement) | $6 |
| Card catalog and daily prices | $0/month |
| Hosting and running the app | $0/month at launch |
| App stores, when a city shows traction | $124 first year, $99/year after |
| Licensed price data, only if the free sources die | $19-49/month |

Launch total is roughly $60-510, and the app-store step later stays comfortably inside the $500-1k budget.

## The risks that stay, even in the surviving version

1. **It earns nothing per trade.**
   OfferUp keeps local deals free and just shut down its paid shipping business; local classifieds monetize thin.
   The revenue path is your subscription instinct (listing visibility and market insights), which Collectr has proven at 4M users but nobody has proven at 4 hundred.
2. **Liquidity is city-by-city.**
   Facebook groups, card shops, and card shows are free, entrenched, and good enough for most adults; we have to be meaningfully better in one metro before this means anything.
3. **A big player could copy it.**
   Collectr (4M users) or Double Holo could bolt local-trading features onto an existing audience.
   Collectr has publicly said it doesn't want to run a marketplace, which softens but does not remove this.
4. **The free data is tolerated, not licensed.**
   Card prices and images come from community sources that ultimately republish TCGplayer data; they have run for years but could be shut off.
   Mitigation is cheap and pre-planned: keep our own database copy so the app survives an outage, and switch to the licensed $19/month feed if needed.

## What we need from you next

These become Founder Questionnaire #2:

1. **Go or no-go** on the meetup-first version described here, knowing the honest risks above.
2. If version 1 could ship **only one feature**, which one is it?
3. **The safety promise, operationally:** when someone gets scammed despite our mechanics, what do we do, and who eats the loss?
4. What does **"strong community"** concretely mean to you - what is the first community thing we build?
