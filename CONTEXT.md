# Local Card Trading (working title pending partner's name pick)

The domain of an app that organizes safe, in-person Pokemon TCG trades for adult collectors, city by city.
No money ever moves through the app.

## Language

### People

**Trader**:
A person with an account in the app.
_Avoid_: user, member, customer

**Verified Trader**:
A Trader whose government ID and selfie have been checked and approved.
_Avoid_: trusted user, KYC'd user

### Cards and inventory

**Card**:
A printing in the catalog, identified by set and collector number.
A Card is catalog data, never a physical object.
_Avoid_: product, item

**Variant**:
A print treatment of a Card, such as normal, holo, reverse holo, or 1st edition.
_Avoid_: finish, edition

**Condition**:
The raw-card state of a Copy on the NM / LP / MP / HP / DMG scale.
Graded (PSA/BGS) cards are out of scope for v1 pricing and this scale.
_Avoid_: grade, quality

**Copy**:
A physical instance of a Card in a specific Variant and Condition.
_Avoid_: physical card, instance

**Collection**:
A Trader's private inventory of the Copies they own.
Visible only to its owner.
_Avoid_: portfolio, binder

**Listing**:
A Copy a Trader has published as available for trading, with photos of that actual Copy.
A Listing is its own thing with its own lifecycle, not a flag on a Collection entry.
_Avoid_: post, ad, sale

**Want**:
A want-list entry naming a Card, optionally narrowed to a Variant and a minimum Condition.
_Avoid_: wish, ISO

**Match**:
An automatic pairing within a City where one Trader's Listing satisfies another Trader's Want.
_Avoid_: hit, suggestion

### Trading

**Trade**:
The one agreement between two Traders that moves from proposed through accepted and scheduled to completed, cancelled, or no-show.
There is exactly one Trade object per deal; proposal, meetup, and record are its phases, not separate things.
_Avoid_: transaction, deal, swap

**Meetup**:
The scheduled phase of a Trade: an agreed time at a Safe Spot.
_Avoid_: appointment, meeting

**Safe Spot**:
A curated public meeting location in the app's directory, typically a police-station exchange zone or equivalent monitored site.
_Avoid_: meetup spot, location

**Trade Record**:
The immutable snapshot a Trade becomes when both Traders confirm completion: participants, items, timestamps, Safe Spot, and any photos.
_Avoid_: receipt, history entry

**No-show**:
The terminal state of a Trade in which one Trader failed to appear at the Meetup.

### Trust

**Safety Program**:
The named bundle of mechanics that replaces any guarantee language: Verified Traders, Safe Spots, Trade Records, and Reputation.
Its public-facing name is chosen with the app name.
_Avoid_: guarantee, protection plan

**Reputation**:
The public trust signals on a Trader's profile: verified badge, completed-Trade count, member-since date, cancellation and no-show counts, and Trade Feedback totals.
_Avoid_: score, rating

**Trade Feedback**:
The mutual thumbs up or down two Traders may leave for each other after a completed Trade.
No free-text reviews exist in v1.
_Avoid_: review, star rating

### Market data

**Catalog**:
The app's own synced database of all ~20k Cards, their Variants, images, and prices.
_Avoid_: card database

**Market Price**:
The daily reference price shown on a Card, sourced from marketplace data and labeled as daily.
_Avoid_: live price, current value

### Place

**City**:
The metro area a Trader trades in; the unit of launch, matching scope, and liquidity.
_Avoid_: region, area, market
