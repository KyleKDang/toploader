# Research: camera card-scanning feasibility (APIs, on-device ML, costs)

Resolves GitHub issue #4 (wayfinder research ticket).
Sources are primary (official API docs and pricing pages, GitHub project READMEs, Apple and Google developer documentation) unless explicitly labeled secondary.
Research date: 2026-08-11.

## Verdict summary

**Scanning is cuttable from v1 without gutting the product, and it should be cut: the partner ranked it last, the approved v1 is meetup-first trading where a search-based card picker does the job, and scanning is already a commodity feature in free incumbent apps, so it differentiates nothing.**
**When it is built (v1.5/v2, alongside portfolio), an MVP-grade scanner is genuinely feasible at ~$0/month: on-device OCR of the card name and collector number, exact-matched against the ~20k-card catalog the app already syncs for prices, with an optional vision-LLM fallback at roughly $0.002 per scan.**
The realistic accuracy story is card-plus-set identification working well on modern English cards in decent light, with variant disambiguation (normal vs reverse holo vs 1st Edition) resolved by a one-tap user confirmation rather than by the camera - which is how the incumbents' scanners work too.
Realistic effort for this team is on the order of 2-4 focused weeks (estimate, not sourced), with the risk concentrated in camera capture quality (glare on holos, sleeves, lighting), not in the matching logic.
The turnkey alternative, Ximilar, has a hard price floor of a €59/month plan because its card-identification endpoint is gated behind the Business 100K tier - affordable later, but not a $0 option.

**Finding 1: Ximilar is the only mature turnkey card-ID API, and its real floor is €59/month, not free.**
Ximilar's collectibles API identifies cards from 15+ games including Pokemon via `POST https://api.ximilar.com/collectibles/v2/tcg_id`, returning `full_name`, `name`, `year`, `set`, `set_code`, `card_number`, `series`, `rarity`, and visual tags including `Foil/Holo` ([Ximilar collectibles recognition docs](https://docs.ximilar.com/collectibles/recognition)).
The docs state plainly: "You must have a Business 100K plan (or higher) to access this service" ([docs](https://docs.ximilar.com/collectibles/recognition)), so the free tier (1,000 credits/month) cannot run this endpoint at all.
Business 100K costs €59/month (~$64) for 100,000 credits, and "Identify a TCG card" costs 10 credits per call, so €59/month buys about 10,000 identifications (~€0.006 per scan); the next tiers are €175/month (300K credits) and €285/month (500K) ([Ximilar pricing](https://www.ximilar.com/pricing/)).
Ximilar publishes no accuracy figure anywhere in its docs or marketing; responses carry per-prediction confidence scores, and the marketing claims "detailed identification" without numbers ([docs](https://docs.ximilar.com/collectibles/recognition); [Ximilar blog on card price checking](https://www.ximilar.com/blog/get-an-ai-powered-trading-card-price-checker-via-api/)).

**Finding 2: beyond Ximilar the commercial field is thin and opaque.**
CardGrader.AI sells a card identification and grading API (photo in, name/set/number out) with credit packs starting at $5 for 25 credits and a 1-3 credit free trial, but per-operation credit costs are only published behind its API (`GET /v1/pricing`) and its site blocked direct page fetches during this research, so those figures come from its own pages as surfaced in search listings ([CardGrader.AI API docs](https://cardgrader.ai/api-docs), partially verified).
No other commercial computer-vision card-identification API for Pokemon surfaced in this research.
TCGplayer, CollX, Collectr, and Double Holo all ship scanners inside their consumer apps but expose no scanning API to third parties (consistent with the closed-API posture documented in [price-data-sources.md](price-data-sources.md)).

**Finding 3: the open-source scanners prove the easy 80% and document exactly where the hard 20% lives.**
A cluster of GitHub projects implements the same architecture: OpenCV finds the card rectangle, a perceptual hash (pHash/dHash/wHash) of the artwork is compared against pre-hashed reference images from pokemontcg.io ([em4go/PokeCard-TCG-detector](https://github.com/em4go/PokeCard-TCG-detector); [NolanAmblard/Pokemon-Card-Scanner](https://github.com/NolanAmblard/Pokemon-Card-Scanner); [hugopeixoto/ptcg-detection](https://github.com/hugopeixoto/ptcg-detection)).
The most instructive README states the core limitation outright: "The base detection algorithm is not able to tell apart two similar cards from two different sets," requiring a second step matching the set symbol against hand-made templates that "are not provided, and they're not easy to create" ([hugopeixoto/ptcg-detection](https://github.com/hugopeixoto/ptcg-detection)).
Scope is uniformly small: NolanAmblard covers only the Evolutions set, hugopeixoto's code has hardcoded paths and camera assumptions, and none of these projects publishes an accuracy benchmark at full-catalog scale ([NolanAmblard README](https://github.com/NolanAmblard/Pokemon-Card-Scanner); [hugopeixoto README](https://github.com/hugopeixoto/ptcg-detection)).
An OCR-based alternative exists and validates that approach: [prateekt/pokemon-card-recognizer](https://github.com/prateekt/pokemon-card-recognizer) recognizes cards from images/video via easyocr/pytesseract, though it recommends a GPU for batch speed and reports benchmarks only in an external slide deck, not the README.
(A separate project, [1vcian/Pokemon-TCGP-Card-Scanner](https://github.com/1vcian/Pokemon-TCGP-Card-Scanner), applies RGB-channel perceptual hashing to TCG Pocket screenshots - digital captures, so its results do not transfer to phone photos of physical cards.)

**Finding 4: there is no public trained model or dataset for full-catalog identification; Roboflow Universe only solves "find the card in the frame."**
The Pokemon datasets on Roboflow Universe are card-detection datasets (bounding boxes or segmentation masks), not identification datasets: e.g. "Pokemon card recognition" by maestromaxo (549 images), "Pokemon Card Detector" (YOLOv11, 52 training images, mAP@50 99.5%), and "pokemon card detection" by TCG Detector (576 images, mAP@50 98.6%) ([Roboflow Universe search](https://universe.roboflow.com/search?q=class%3Apokemon_card); per-dataset figures as listed on their Universe pages - [maestromaxo](https://universe.roboflow.com/maestromaxo/pokemon-card-recognition), [Pokemon Scanner](https://universe.roboflow.com/pokemon-scanner/pokemon-card-detector-cuyon), [TCG Detector](https://universe.roboflow.com/tcg-detector/pokemon-card-detection-7aaz7-mxbhx) - direct page fetches were blocked during this research, so figures were read from Universe listings).
Detection is the easy, solved step; the unsolved step - which of ~20k cards is this - would require training a classifier or embedding model over the whole catalog, and no such public model or labeled photo dataset was found.
Training one is not a realistic zero-budget project for a team with no ML background, and it would still face the set/variant problem below.

**Finding 5: the credible $0 architecture is on-device OCR of the name plus collector number, matched against the catalog the app already has.**
Every modern English Pokemon card prints a collector number as "number/set-total" (e.g. 025/198), and promos carry unique prefixed numbers; the OCR'd number-plus-total pair, cross-checked with the OCR'd card name, resolves the card and its set via exact lookup in the pokemontcg.io catalog - the same ~20k-card database with per-card `number`, `set` and image fields that issue #3's price stack already syncs ([pokemontcg.io card object](https://docs.pokemontcg.io/api-reference/cards/card-object); the collision claim is arithmetic over that catalog and should be validated against it offline, which is a cheap one-off script).
OCR is free on-device on both platforms: Apple's Vision framework provides `VNRecognizeTextRequest` ("An image-analysis request that finds and recognizes text in an image," iOS 13+) ([Apple documentation](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)), and Google's ML Kit Text Recognition v2 recognizes Latin-script text with "ML Kit's processing happens on-device. This makes it fast and unlocks real-time use cases like processing of camera input," working offline ([ML Kit](https://developers.google.com/ml-kit); [Text Recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2)).
Apple's Vision also offers on-device image feature prints (`VNGenerateImageFeaturePrintRequest`, iOS 13+) usable as a free similarity check against catalog artwork to confirm the OCR match ([Apple documentation](https://developer.apple.com/documentation/vision/vngenerateimagefeatureprintrequest)) - but as a confirmation signal, not the primary key, because image similarity alone reproduces the set-confusion problem from Finding 3.
For frames the OCR pipeline cannot resolve (worn cards, odd layouts, glare), a server-side vision-LLM fallback is nearly free at low volume: Anthropic's own worked example prices a 1000x1000 image at "about $1.30 USD per thousand images" of input on Claude Haiku 4.5 ($1/M input tokens), so a scan with a short structured response lands around $0.002 ([Anthropic vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)).

**Finding 6 (the hard part, answered honestly): set identification is solvable; variant identification from one photo is not, and the industry answer is scan-then-confirm.**
The reference database has exactly one image per card, with the variants (normal, holofoil, reverse holo, 1st Edition) existing only as price sub-objects on that single card record ([pokemontcg.io card object](https://docs.pokemontcg.io/api-reference/cards/card-object)) - so no matching method that compares against catalog images can, even in principle, tell a reverse holo from a normal print of the same card, because they share the same artwork, name and number and differ only in foil treatment.
Ximilar's `Foil/Holo` visual tag is a partial exception, but it is one binary-ish tag, not a resolution of the full variant space, and 1st Edition stamps and shadowless borders are further edge cases ([Ximilar docs](https://docs.ximilar.com/collectibles/recognition)).
The incumbent's own product concedes this: TCGplayer's scanning help pages instruct users to scan against "a patternless surface," tilt the card "at a 45° angle" or use flash to defeat holo glare, and document the flow for editing "incorrectly scanned cards" ([Tips for Accurate Scanning](https://help.tcgplayer.com/hc/en-us/articles/115009674788-Tips-for-Accurate-Scanning); [Resolving Card Scanning Issues](https://help.tcgplayer.com/hc/en-us/articles/115004173447-Resolving-Card-Scanning-Issues)).
No vendor or project in this research publishes an end-to-end accuracy number for English Pokemon card identification from phone photos; any accuracy promise would be invented.
The realistic design target is therefore: high hit-rate on card-plus-set for modern cards in decent light (to be measured, not promised), a candidate list rather than a hard failure when confidence is low, and a one-tap variant confirmation on every scan - which doubles as the correction UI.

**Finding 7: scanning is a commodity feature, not a differentiator, and v1 does not need it.**
Free apps already ship it: TCGplayer's app scans and identifies cards at no charge ([TCGplayer scanning help](https://help.tcgplayer.com/hc/en-us/articles/115009674788-Tips-for-Accurate-Scanning)), CollX is a scan-first app with ~4.5M users, and Double Holo lists card scanning among its marketplace features (both documented with sources in [competitive-landscape.md](competitive-landscape.md)).
The partner's own ranking from Questionnaire #1 puts scanning last: buy/sell > meetups > price tracking > portfolio > scanning.
The v1 job - creating a listing or a want/have entry for a meetup trade - is served by a search-with-autocomplete picker over the same 20k-card catalog, which must be built anyway and identifies a card in a few keystrokes.
Scanning's real payoff is bulk collection intake, which belongs to the portfolio feature (ranked fourth); the natural sequencing is to ship scanning with portfolio, not with meetup trading.

---

## Commercial APIs in detail

### Ximilar (the benchmark option)

Endpoint: `POST https://api.ximilar.com/collectibles/v2/tcg_id`, JSON with up to 10 images per batch by URL or base64 ([docs](https://docs.ximilar.com/collectibles/recognition)).
Returns: card identification (`full_name`, `name`, `year`, `set`, `set_code`, `card_number`, `series`, `rarity`, `out_of`), visual tags including `Foil/Holo` and alphabet/language detection, links to marketplaces, and optional graded-slab reading and price statistics at extra credit cost ([docs](https://docs.ximilar.com/collectibles/recognition)).
Coverage: "supports cards from over 15 games, including Pokémon, Yu-Gi-Oh!, Magic: The Gathering, One Piece, and Lorcana," with Japanese/Korean/Chinese variant identification for some games ([docs](https://docs.ximilar.com/collectibles/recognition)).
Cost: 10 credits per TCG identification; free tier is 1,000 credits/month but the endpoint requires Business 100K (€59/month, 100K credits) or higher, so the production floor is €59/month for ~10,000 scans; credit packs (€10 for 10K credits, non-expiring) can extend a tier ([pricing](https://www.ximilar.com/pricing/); [docs](https://docs.ximilar.com/collectibles/recognition)).
Accuracy: none published; confidence scores per prediction only.
Verdict: the de-risk upgrade path if the DIY scanner underperforms - the same role JustTCG plays for price data in issue #3 - but not a day-one cost at this budget, and it still leaves variant confirmation to the user.

### CardGrader.AI

Card identification plus AI pre-grading API; self-serve keys, free trial of 1-3 credits, credit packs from $5 for 25 credits; authoritative per-call pricing lives behind `GET /v1/pricing` ([API docs](https://cardgrader.ai/api-docs), pages partially verified via search listings because the site blocks automated fetches).
Verdict: exists as a fallback quote-check against Ximilar, but too opaque to plan around; note its blog content markets APIs aggressively, so treat its claims about competitors as marketing.

### Checked and set aside

TCGplayer app scanning: consumer feature only, no API, and TCGplayer's developer program is closed to new applicants anyway (documented in [price-data-sources.md](price-data-sources.md)).
Roboflow hosted inference: a train-your-own-model platform, not a card-identification service; its public Pokemon models only detect card rectangles (Finding 4).
Collectr, CollX, Double Holo, Dex-style collection apps: in-app scanners, no public developer API found.

## Approach comparison: hashing vs classification vs OCR

Image-hash matching (pHash and friends against catalog images) is free and simple and is what most hobby projects use, but it is confidence-limited by glare, sleeves and holo patterns on phone photos, and it demonstrably cannot separate similar cards across sets without a bolt-on set-symbol matcher ([hugopeixoto/ptcg-detection](https://github.com/hugopeixoto/ptcg-detection)).
ML classification over ~20k classes has no public model, no public labeled photo dataset, and an ongoing retraining obligation as new sets ship (a new Pokemon set lands roughly quarterly per the catalog history in [price-data-sources.md](price-data-sources.md)); it is the wrong tool for this team.
OCR of name plus collector number is the approach that directly encodes the set into the match key, runs free on-device on both platforms, degrades gracefully (unresolved scans fall back to search or a vision-LLM call), and is validated in open source ([prateekt/pokemon-card-recognizer](https://github.com/prateekt/pokemon-card-recognizer)).
Recommended MVP shape: on-device card-edge detection (or simply a capture guide overlay), on-device OCR, exact match against the local catalog, Vision feature-print similarity as a sanity check on iOS, candidate list on ambiguity, one-tap variant confirmation, optional Haiku-class vision-LLM fallback server-side.

## Cost model

Assumes the ~20k-card catalog and card images are already synced locally per the issue #3 architecture, so the scanner adds no new data dependency.

- DIY on-device stack: $0/month at any user count for OCR and matching (all on-device); vision-LLM fallback at ~$0.002/scan means even 5,000 fallback scans/month is ~$10/month ([Anthropic vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)).
- Ximilar stack: €59/month for up to ~10,000 scans, €175/month for ~30,000 ([pricing](https://www.ximilar.com/pricing/)); scales with scans, not users, and 1k active users scanning 20 cards/month would already exceed the €59 tier.
- CardGrader.AI: ~$0.20/credit at the $5 entry pack with unpublished credits-per-scan; unplannable at present.

Effort (estimate, not sourced): the matching pipeline is days of work given the catalog exists; the camera capture experience is where the unfamiliar-to-mobile risk sits (frame processing, focus/exposure, glare guidance, edge cases like sleeves and toploaders), and 2-4 focused AI-accelerated weeks to MVP-grade is a reasonable planning number, with real-world capture polish an ongoing cost after that.
Ximilar removes the matching work but none of the camera work, so it saves perhaps a week while adding the €59/month floor.

## Is scanning cuttable from v1?

Yes, and the evidence says cut it.
It is the partner's lowest-ranked feature; the approved meetup-first v1 flows (list a card, post a want, log a trade) are fully served by catalog search with autocomplete; and because free incumbents (TCGplayer app, CollX, Double Holo) all ship scanners, having one buys no differentiation while not having one costs none - the differentiation thesis from issue #2 lives in local community mechanics, not computer vision.
The one thing v1 should do for scanning is architectural and free: build the card picker against the local catalog keyed by (name, set, number), which is exactly the lookup structure the future scanner needs, so scanning later becomes an input method swap rather than a rework.
Ship scanning with the portfolio feature in v1.5/v2, starting with the $0 OCR pipeline, measure real accuracy on the team's own collections before promising anything in marketing, and keep Ximilar's €59/month tier in the back pocket if DIY accuracy disappoints.
