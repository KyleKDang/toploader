# Research: payments, legal, and trust-and-safety weight of a card marketplace

Resolves GitHub issue #5 (wayfinder research ticket).
This file establishes the `docs/research/` convention for research findings; no prior research-notes convention existed in this repo (docs/ previously held only `docs/agents/`).
Sources are primary (official docs, statutes, regulator and first-party pages) unless explicitly labeled secondary.
Research date: 2026-08-10.

## Verdict summary

This ticket is a kill-test.
Three findings are kill-level at the partner's stated budget ($500-1k total), and three more are load-bearing.

**Kill-level 1: self-held escrow (the v2 "we hold both sides' money" idea) is money transmission and is dead at this budget.**
Accepting funds from one person and transmitting them to another is the literal federal definition of money transmission ([31 CFR 1010.100(ff)(5)](https://www.law.cornell.edu/cfr/text/31/1010.100)), and no escrow exemption exists in the regulation.
Doing it requires FinCEN MSB registration plus a written AML compliance program, and separately a money transmitter license in essentially every state of operation, with surety bonds from $10,000 to $500,000 per state and nationwide licensing costs commonly quoted above $1M (secondary; see the self-held escrow section).
Operating without the required state licenses or federal registration is a federal crime punishable by up to 5 years in prison ([18 U.S.C. 1960](https://www.law.cornell.edu/uscode/text/18/1960)).
The compliant alternative is cheap and standard: let a licensed provider hold the money.
Stripe explicitly supports delaying seller payouts (up to 2 years for US platforms) while Stripe, not the app, holds the funds ([Stripe manual payouts](https://docs.stripe.com/connect/manual-payouts)), and licensed third-party escrow providers such as Escrow.com exist for high-value trades ([Escrow.com licenses](https://www.escrow.com/escrow-licenses)).
Kill the mechanism (the app touching the money), keep the feature (funds released only after delivery/confirmation).

**Kill-level 2: a literal "100% guarantee on not being scammed" cannot be honored at this budget, and advertising a guarantee you do not honor is a deceptive practice.**
FTC guides require that a money-back style guarantee be advertised only if the advertiser "promptly and fully performs its obligations" ([16 CFR 239.5](https://www.law.cornell.edu/cfr/text/16/239.5)) and that all material conditions be disclosed ([16 CFR 239.3](https://www.law.cornell.edu/cfr/text/16/239.3)).
A single honored claim on one mid-value card ($200-500, the range where eBay's authenticity program kicks in) consumes half to all of the entire budget, and a no-payments app has no transaction record with which to verify claims, making staged-scam collusion payouts trivial.
The promise as stated must be killed or reframed as concrete safety mechanics (verification, safe meetup spots, documented trades), which are deliverable.

**Kill-level 3: "Pokemon" in the app name, logo, or marketing lead.**
Pokemon marks and card art belong to Nintendo/Creatures/GAME FREAK with TPCi enforcing, and TPCi's own legal page grants fans no commercial rights ([Pokemon.com legal](https://www.pokemon.com/us/legal/)).
Apple's guideline 5.2.1 independently bars third-party trademarks in apps without permission ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
Enforcement history (secondary, below) shows TPCi acts on branding-level uses.
A neutral app name with a compatibility disclaimer is the industry-standard posture (Collectr, pokemontcg.io) and costs nothing.

**Load-bearing 4: shape (i), the payments marketplace, is legal without licenses if Stripe (or an equivalent) holds the funds, but it is operationally heavy.**
The platform eats chargebacks and dispute fees, must onboard sellers through KYC, becomes a marketplace facilitator for sales tax in every sales-tax state once thresholds are crossed, and inherits 1099-K mechanics.
None of this is impossible; all of it is exactly the cost that incumbents price into their 10-13% fees, which a 0% fee wedge has to absorb out of nothing.

**Load-bearing 5: shape (ii), meetup-only with no in-app money, removes nearly all of the financial-regulatory burden, and what remains fits the budget.**
Money transmission, KYC, chargebacks, facilitator sales tax, and 1099-K all attach to moving or collecting money, and disappear when the app does not touch payments.
What remains: IP posture (above), a DMCA agent registration, CSAM reporting on actual knowledge, app-store accounts ($99/yr Apple + $25 Google), and Section 230-protected moderation.
Total hard cost is on the order of $130 plus entity formation.

**Load-bearing 6: card images and set names are a tolerated-not-licensed risk, manageable with the standard posture.**
Marketplaces and tracker apps industry-wide display card scans and set names without TPCi enforcement to date; the risk is real but concentrated in branding-level uses, not card-database uses.

---

## Shape (i): payments marketplace

### Stripe Connect: fees and KYC burden

Stripe Connect's standard card processing is 2.9% + $0.30 per successful charge, and on the "you handle pricing" platform model Stripe adds $2 per monthly active connected account, 0.25% + $0.25 per payout sent, 0.25% of payout volume, and $2.99 per 1099 e-filed ([Stripe Connect pricing](https://stripe.com/connect/pricing)).
KYC/onboarding: every seller receiving payouts must clear Stripe's know-your-customer verification (name, DOB, address, ID data, bank account), with additional information demanded at volume thresholds; Stripe pauses charges or payouts if it is not provided ([Stripe identity verification for connected accounts](https://docs.stripe.com/connect/identity-verification)).
Stripe's hosted Connect Onboarding shoulders the collection flow, but the docs are explicit that the platform "still must monitor for and prevent fraud" and cannot treat Stripe's verification as its own compliance.
Alternatives (PayPal Commerce Platform, Adyen for Platforms, Mangopay) share the same structure - the licensed provider holds and routes the funds - so switching providers does not change the legal analysis, only the fee schedule (structural observation, not separately sourced).

Implication for the 0% fee wedge: under Stripe's separate charges and transfers model, "your account balance is debited for the cost of the Stripe fees, refunds, and chargebacks" ([separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)).
At 0% seller fees the platform either passes ~3% processing to buyers/sellers (contradicting the wedge as marketed) or eats it on every sale with no revenue.

### Chargebacks and fraud patterns in card sales

Mechanics: when a buyer disputes a charge, the disputed amount plus a $15 dispute fee is immediately debited from the platform's balance; the $15 received fee is non-refundable even on a win, countering costs a further $15 (returned on a win), the issuing bank alone decides, and the cycle runs 2-3 months ([how disputes work](https://docs.stripe.com/disputes/how-disputes-work); [dispute fee amounts](https://support.stripe.com/questions/june-2025-pricing-updates-for-disputes)).
Trading-card-specific patterns (secondary sources): counterfeit cards including fakes sealed in counterfeit graded slabs, item-not-received claims on shipped high-value cards, friendly fraud (buyer receives the card then charges back), and presale/hype-window fraud around new Pokemon sets ([Bitdefender on Pokemon card scams](https://www.bitdefender.com/en-us/blog/hotforsecurity/pokemon-card-scams-2026), secondary; [Value Added Resource on eBay Pokemon presale fraud risk](https://www.valueaddedresource.net/ebay-pokemon-presales-fraud-risks/), secondary).
High-value card-not-present sales are a classic dispute magnet, which is why eBay built an authentication pipeline for exactly this category (below).
A platform with $0 revenue per sale has no margin to absorb even the $15 fee on a frivolous dispute, let alone a lost $500 dispute after the seller has been paid; delaying payouts until confirmed delivery (the Stripe pattern above) is the standard mitigation.

### Marketplace facilitator sales tax

All 45 states with a statewide sales tax, plus DC, have marketplace facilitator laws requiring the platform that lists goods and collects payment to collect and remit sales tax on facilitated sales ([Streamlined Sales Tax marketplace facilitator guidance](https://www.streamlinedsalestax.org/for-businesses/marketplace-facilitator); [Stripe explainer](https://stripe.com/resources/more/marketplace-facilitator-laws); [Avalara state-by-state guide](https://www.avalara.com/us/en/learn/guides/state-by-state-guide-to-marketplace-facilitator-laws.html), secondary).
Obligations attach per state once economic nexus thresholds are crossed - most commonly $100,000 in sales (some states also 200 transactions; California uses $500,000) - plus immediately in any state where the business has physical presence.
The definition turns on collecting payment: a platform that never collects money for sellers is not a facilitator, which is why this burden belongs to shape (i) only.
At MVP volume the thresholds will not be crossed in most states, but the obligation is a scaling certainty and requires tax registration, filing, and remittance infrastructure (Stripe Tax and similar services exist at additional per-transaction cost).

### 1099-K reporting

The federal reporting threshold for third-party settlement organizations is back at $20,000 AND more than 200 transactions per seller per year: the One Big Beautiful Bill Act (signed July 4, 2025) retroactively repealed the $600 threshold ([IRS: Understanding your Form 1099-K](https://www.irs.gov/businesses/understanding-your-form-1099-k); [IRS FAQ on the OBBBA reversion](https://www.irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000)).
This is far friendlier to a card marketplace than the $600 regime would have been: only sellers doing more than $20k across 200+ sales trigger filings.
Some states have lower state-level thresholds (secondary, commonly noted in the same coverage), and using Stripe Connect, 1099 filing can be delegated at $2.99 per form ([Stripe Connect pricing](https://stripe.com/connect/pricing)).
Filing 1099-Ks also implies collecting seller taxpayer identification numbers, which is part of why marketplaces make sellers complete tax onboarding before payouts.

### Shipping and escrow patterns other card marketplaces use

TCGplayer (the category incumbent): sellers ship directly to buyers; TCGplayer charges marketplace sellers a 10.75% commission (raised from 10.25% effective Feb 10, 2026) plus a 2.5% + $0.30 processing fee on the full order total ([TCGplayer fee schedule](https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees), primary, corroborated by [TCGplayer's seller blog on the fee change](https://seller.tcgplayer.com/blog/important-changes-to-tcgplayer-direct-minimum-pricing-and-marketplace-fees) and secondary fee calculators).
eBay: single trading cards at $200+ are routed through the Authenticity Guarantee program - the seller ships to an authentication facility where PSA inspects the card, then it is forwarded to the buyer; eBay pays for authentication and refunds the buyer if the card fails ([eBay Authenticity Guarantee for trading cards](https://www.ebay.com/authenticity-guarantee/tradingcards); [eBay/PSA partnership announcement](https://www.prnewswire.com/news-releases/ebays-authenticity-guarantee-now-includes-graded-trading-cards-through-partnership-with-psa-301537037.html); threshold drop from $250 to $200 per [Sports Collectors Daily](https://www.sportscollectorsdaily.com/ebay-expands-authenticity-guarantee-to-trading-cards-selling-for-200-and-up/), secondary).
The pattern to note: no mainstream card marketplace holds both sides' money itself as an unlicensed middleman; they either route funds through licensed processors with delayed release, or (eBay-scale) operate their own licensed payment entities, and they solve the counterfeit problem with physical authentication, not custody of cash.

### App-store rules for physical-goods marketplaces

The partner's question ("does Apple take 30%?") is answered: no.
Apple's guideline 3.1.3(e) requires that apps selling "physical goods or services that will be consumed outside of the app... use purchase methods other than in-app purchase," i.e., Stripe/card entry/Apple Pay, on which Apple takes no commission ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
Google Play is symmetric: Play Billing must not be used for physical goods, so no Google commission applies ([Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)).
Fixed costs: Apple Developer Program $99/year ([Apple enrollment support](https://developer.apple.com/support/enrollment/)); Google Play Console $25 one-time ([Play Console registration](https://support.google.com/googleplay/android-developer/answer/6112435)).

### The self-held escrow verdict (the partner's v2 idea)

Federal definition: money transmission services means "the acceptance of currency, funds, or other value that substitutes for currency from one person and the transmission of currency, funds, or other value that substitutes for currency to another location or person by any means" ([31 CFR 1010.100(ff)(5)](https://www.law.cornell.edu/cfr/text/31/1010.100)).
An app that takes the buyer's (or both traders') money, holds it, and releases it to the other side is accepting funds from one person and transmitting them to another; that is the definition, and the regulation contains no escrow exemption.
The nearest exemption, the payment processor exemption, requires per FinCEN ruling FIN-2014-R009 that the entity (1) facilitates purchase of goods/services, (2) operates through clearance and settlement systems that admit only BSA-regulated financial institutions, (3) acts under a formal agreement, (4) with the seller or creditor ([FIN-2014-R009](https://www.fincen.gov/system/files/administrative_ruling/FIN-2014-R009.pdf); conditions corroborated via [Orrick summary](https://infobytes.orrick.com/2014-09-05/fincen-rules-regulations-money-services-businesses-do-not-apply-isos-and-exempt-payment-processors/), secondary).
A consumer app holding both traders' balances is not operating through BSA-regulated settlement rails as a processor for merchants; it fails the exemption.

What money transmitter status costs:

- FinCEN MSB registration within 180 days of starting, renewed every two years; failure carries $5,000 per day civil penalties ([31 CFR 1022.380](https://www.law.cornell.edu/cfr/text/31/1022.380)).
- A written AML program with a designated compliance officer, internal controls, employee training, and independent review ([31 CFR 1022.210](https://www.law.cornell.edu/cfr/text/31/1022.210)).
- State-by-state money transmitter licenses: the Money Transmission Modernization Act model law (net worth, surety bond, and permissible-investment requirements) has been enacted in whole or part by 31+ states, coordinated via NMLS ([CSBS MTMA](https://www.csbs.org/csbs-money-transmission-modernization-act-mtma)).
- Costs (secondary, industry licensing counsel): surety bonds range roughly $10,000 (WA, WY) to $500,000 (NY, KY, MI), with California up to $7M; application fees $500 to $10,000+ per state; nationwide licensing programs commonly exceed $1M all-in ([Ridgeway FS state-by-state requirements](https://www.ridgewayfs.com/money-transmitter-license-requirements-by-state/), secondary; [Cornerstone licensing guide](https://cornerstonelicensing.com/money-transmitter-license), secondary).
- Criminal exposure: operating a money transmitting business without a required state license, or without FinCEN registration, is a federal felony with up to 5 years imprisonment ([18 U.S.C. 1960](https://www.law.cornell.edu/uscode/text/18/1960)).

Verdict: kill-level.
At a $500-1k total budget, even a single state's license is out of reach, and unlicensed operation is not a compliance gap but a crime.

The compliant alternative, verified:

- Stripe holds the funds; the platform sequences their release.
  Stripe's own docs address this exactly: "Escrow has a precise legal definition, and Stripe doesn't provide escrow services or support escrow accounts. However, you can control payout timing through manual payouts... Use delayed payouts when a delivery is delayed or when you think you have a possibility of a refund," with a 2-year maximum holding period for US businesses ([Stripe manual payouts](https://docs.stripe.com/connect/manual-payouts)).
  The design rule: money flows buyer -> Stripe -> seller's connected account, and the app never sweeps user funds into its own bank account.
- Note Stripe's restricted businesses list places "escrow services," money transmitters, and "payment facilitation and aggregation (including receiving settlement proceeds for goods or services that you did not provide...)" under prohibition or heightened due diligence ([Stripe restricted businesses](https://stripe.com/legal/restricted-businesses)), so the product must be built and described as a marketplace with delayed payouts, not as an escrow service.
- For true two-sided high-value trades (cash on both sides), a licensed escrow provider can hold the funds: Escrow.com operates through Internet Escrow Services, Inc., licensed and audited under state escrow and money transmission regimes ([Escrow.com licenses](https://www.escrow.com/escrow-licenses); [California DFPI licensed online escrow companies](https://dfpi.ca.gov/regulated-industries/escrow-law/online-escrow-companies/)).

---

## Shape (ii): local meetup trading, no in-app payments

### What incumbents actually do for meetup safety

OfferUp (first-party): the Community MeetUp Spots program designates ~1,900+ safe exchange locations nationwide, typically police-station lots and partnered businesses with 24/7 lighting and video surveillance; TruYou identity verification requires a phone number, government photo ID, and a selfie; secure in-app chat avoids sharing personal contact info; a law-enforcement liaison/investigations capability and ML moderation (nearly 1M risky items removed, 10k+ accounts disabled in a year) round it out ([OfferUp trust and safety commitment](https://about.offerup.com/trust-safety-commitment); [MeetUp Spots program announcement](https://www.prnewswire.com/news-releases/offerups-community-meetup-spots-program-grows-to-nearly-1-900-locations-across-the-us-300854777.html), first-party press release).
Facebook Marketplace and general law-enforcement guidance is the same playbook: meet in public/high-traffic places or designated police safe exchange zones, tell someone where you are going, inspect the item before completing the trade ([Fairfax County police online transaction safety guidance](https://www.fairfaxcounty.gov/news/10-safety-tips-online-transactions), government source; Meta's own help page was unreachable during research, so the platform-side framing here rests on the police guidance and secondary coverage).
Everything in this playbook is replicable at near-zero cost: a directory of police-station safe exchange zones, in-app meetup guidance, report/block, and optional ID verification (verification vendors charge per check, so it becomes a marginal cost per verified user).

### Liability and moderation duties

Section 230(c)(1): "No provider or user of an interactive computer service shall be treated as the publisher or speaker of any information provided by another information content provider" ([47 U.S.C. 230](https://www.law.cornell.edu/uscode/text/47/230)).
User listings, user chat, and user conduct claims are therefore generally not the app's legal liability, with exceptions for federal criminal law, intellectual property law, and FOSTA/sex-trafficking claims.
Courts have applied Section 230 to bar suits against classifieds platforms even for serious offline harms arising from user listings (e.g., Daniel v. Armslist; secondary characterization, widely reported case law).
Duties that remain regardless of payments:

- CSAM reporting: providers must report apparent child sexual abuse material to NCMEC upon actual knowledge (no proactive monitoring duty); knowing and willful failure carries penalties up to $600,000+ for a first violation ([18 U.S.C. 2258A](https://www.law.cornell.edu/uscode/text/18/2258A)).
- DMCA safe harbor requires registering a designated agent with the Copyright Office via its online directory and keeping it current ([Copyright Office DMCA directory](https://www.copyright.gov/dmca-directory/)); the filing fee is nominal ($6 per 37 CFR 201.38).
- App-store moderation expectations: Apple requires user-generated-content apps to include content filtering, a reporting mechanism, and user blocking (guideline 1.2, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
- The app's own advertising claims (including any guarantee) remain fully its liability under FTC Act Section 5 and state UDAP laws; Section 230 does not cover first-party statements.
- Standard hygiene: a privacy policy, state privacy-law compliance as usage scales, and an LLC to hold the liability (state filing fees vary, roughly $50-500; general knowledge, worth budgeting).

### Does removing payments remove the regulatory burden?

Mostly yes, and the removal is structural, not incidental.
Money transmission analysis, MSB registration, state licensing, KYC, PCI-DSS, chargebacks, marketplace facilitator sales tax (which attaches only to platforms that collect payment), and 1099-K (which attaches to third-party settlement organizations) all disappear when no money moves through the app.
What survives is the non-financial layer: IP posture, CSAM/DMCA/moderation duties, advertising law for the app's own promises, and privacy.
That surviving layer costs on the order of $130 in fees (Apple $99/yr, Google $25, DMCA $6) plus entity formation, which fits the $500-1k budget.
Shape (ii) is therefore compliance-viable; its risks are product risks (liquidity, safety incidents damaging reputation) rather than regulatory ones.

### Pricing the "100% guarantee on not being scammed"

The law: a guarantee may be advertised only with all material conditions disclosed clearly and prominently ([16 CFR 239.3](https://www.law.cornell.edu/cfr/text/16/239.3)), and only "if the seller... promptly and fully performs its obligations" under it ([16 CFR 239.5](https://www.law.cornell.edu/cfr/text/16/239.5)); an unhonorable guarantee is deceptive advertising exposed to FTC and state attorney-general action.
The mechanics problem in a no-payments app: the platform never sees the price, never holds funds, and has no authoritative record that a trade even occurred, so it cannot verify a scam claim, cannot recover from the scammer, and cannot fund payouts from margin (there is none at 0% fees).
The arithmetic problem: adult collector-investor trades routinely involve $200+ single cards (the eBay authentication threshold exists because this range is common); honoring one claim at $500 consumes 50-100% of the entire venture budget, and honoring even five $200 claims costs $1,000.
The fraud problem: an unconditional cash-backed guarantee in an app with no transaction records invites collusion - two accounts stage a "scam" and split the payout - which is why no incumbent offers an unconditional guarantee; eBay's Money Back Guarantee is conditioned on payment through eBay's own rails, and OfferUp's payment protection covers only in-app-paid shipped deals.
What is actually possible without payments, at budget: identity verification of traders, reputation/history, a police safe-exchange-spot directory, in-app trade confirmation flows that create a documented record (photos, agreed items, timestamps), counterfeit-spotting education, report/block/ban, and cooperation with law enforcement on reported thefts.
These reduce scam probability; none of them indemnifies anyone.
Verdict: kill the phrase "100% guarantee" as a funded promise; ship the mechanics as a named safety program, or defer any monetary guarantee to a future state where trades run through held funds (v2 with Stripe delayed payouts) and the guarantee can be conditioned, capped, and funded from fees.

---

## Both shapes: Pokemon / Nintendo / TPCi intellectual property exposure

### Who owns what, and TPCi's stated position

Pokemon copyrights run to Nintendo, Creatures Inc., and GAME FREAK inc., with The Pokemon Company International administering the brand; TPCi's legal page grants fan creations no commercial license and asserts rights over trademarks, service marks, and content ([Pokemon.com legal](https://www.pokemon.com/us/legal/); [legal information page](https://www.pokemon.com/us/legal/information)).
Card artwork is copyrighted; "Pokemon" and related names/logos are registered trademarks.

### The three exposure tiers, from fatal to tolerated

Tier 1 - the app's own branding (fatal if wrong): putting "Pokemon" in the app name, icon, or marketing headline is straightforward trademark use and also violates Apple guideline 5.2.1, which bars third-party trademarks without permission and lets rights holders demand takedowns ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
Nominative fair use permits truthful references such as "a marketplace for Pokemon TCG cards" in descriptive text (secondary legal commentary, e.g., [Law with Miller on using the Pokemon name at events](https://lawwithmiller.com/blogs/trademarks/don-t-poke-the-mon-can-you-legally-say-pokemon-at-your-event)), but the name and brand identity must be neutral.
Tier 2 - card images and set names in listings/database (tolerated in practice): eBay, TCGplayer, Collectr, TCG Collector, and every price tracker display card scans and set names.
First-sale doctrine protects reselling a genuine physical card; the image reproduction itself is technically TPCi's copyright, and the industry-wide practice survives on tolerance and nominative use rather than licenses.
No enforcement against card marketplaces or collection trackers for card scans surfaced in this research.
Tier 3 - data dependencies (convenient but revocable): [pokemontcg.io](https://pokemontcg.io/) is a free community-run API serving 20,000+ cards with images and prices, explicitly "not produced, endorsed, supported, or affiliated with Nintendo or The Pokemon Company" ([API docs and project description](https://docs.pokemontcg.io/); corroborating project pages, secondary).
It has operated for years, which demonstrates tolerance, not permission; building on it means accepting that TPCi could end it at any time.

### How existing apps handle it

Collectr ships on both app stores as "Collectr - TCG Collector App" - a neutral name - with 2M+ users tracking Pokemon cards with images and prices ([App Store listing](https://apps.apple.com/us/app/collectr-tcg-collector-app/id1603892248)), demonstrating that Apple accepts Pokemon-card apps in practice when the branding is neutral and content is factual card data.
Comparable unofficial apps carry explicit disclaimers that they are unaffiliated and that imagery belongs to Nintendo/Creatures/GAME FREAK.
TCGplayer operates the largest card marketplace using card names, set names, and images throughout.

### What has actually been enforced (all secondary sources)

- 2015: TPCi sued the organizer of an unofficial fan PAX party over poster use of Pikachu/Snivy artwork, settling for $4,000 plus an apology ([Nintendo Life](https://www.nintendolife.com/news/2015/10/the_pokemon_company_sues_fan_for_copyright_infringement_demands_usd4000_in_damages)).
- 2016: cease-and-desist to a developer publishing a Pokemon Go API ([reported in fan-project enforcement coverage](https://stories.avvo.com/news/pokemon-fine-art-suing-users.html)).
- 2021: ~$15M damages won against a Chinese clone-game operation ([Marks Gray summary](https://marksgray.com/intellectual-property-law/pokemon-company-wins-15m-in-damages/)).
- Ongoing: fan games and mods routinely receive takedowns ([Axios on Nintendo and fan games](https://www.axios.com/2022/01/24/fan-made-game-escapes-nintendo)).
- A former TPCi chief legal officer has said the company does not hunt fan projects but acts "when projects cross a certain line" (same secondary coverage).

The pattern: enforcement lands on uses of characters, artwork, and marks as branding or as game content, and on counterfeit goods.
It has not landed on marketplaces, price trackers, or card databases dealing in genuine cards with neutral branding.

### Practical posture for this app

Neutral name and icon with zero Pokemon marks or character art; "for the Pokemon TCG" only in descriptive text; a visible non-affiliation disclaimer; a registered DMCA agent and prompt takedown handling; card data/images via community sources treated as a revocable dependency with an exit plan (user-photographed cards as fallback).
With that posture, IP exposure is a manageable background risk for both shapes, not a kill.

---

## What this means for the two MVP shapes

Shape (ii) (meetup-first v1, already provisionally approved) survives the kill-test on the regulatory axis: its compliance load is roughly $130 plus entity formation, provided the "100% guarantee" is reframed and the branding stays neutral.
Shape (i) (payments marketplace) is legally buildable at small scale on Stripe Connect without any license, but its operating economics at 0% seller fees are negative on every transaction and every dispute, and its compliance surface (facilitator tax, 1099-K, KYC-driven onboarding friction) grows with success; it belongs in v2 only with fee revenue attached.
The v2 self-held escrow idea is the one outright illegal-at-this-budget item surfaced: the same user promise (no one gets scammed on a paid trade) is deliverable compliantly by sequencing Stripe-held funds, which costs engineering effort instead of licenses.
