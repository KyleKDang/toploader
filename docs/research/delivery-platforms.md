# Research: zero-budget delivery platforms (web/PWA vs Expo/React Native vs native)

Resolves GitHub issue #6 (wayfinder research ticket).
Sources are primary (official platform docs, MDN/web.dev/WebKit, Apple and Google developer program pages, and the hosting providers' own pricing pages) unless explicitly labeled secondary.
Free-tier limits change often; every limit below is what the provider's page said on the research date.
Research date: 2026-08-11.

## Verdict summary

Delivery is not a kill for either MVP shape: both can launch on skills Kyle already has, for $0/month infrastructure and at most $124 of one-time-plus-annual store fees.
The honest finding is narrower and more useful: the only feature that genuinely forces a choice between web and native is iOS push notifications, and the only budget line that matters is Apple's $99/year.

**Verdict for shape (ii), local-first trading (the live v1): mobile-first responsive web app, installable as a PWA, on Supabase's free tier plus a free static host; $0 total, shipped with zero new-platform learning.**
Camera needs for v1 are listing photos, and mobile web gets the full native camera for still photos via the file-input capture path ([MDN capture attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)).
The failure point is iOS notifications: web push on iOS works only after the user manually adds the app to the Home Screen from Safari's share menu, and no install prompt exists on iOS ([WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [web.dev PWA installation](https://web.dev/learn/pwa/installation)).
For an app whose core loop is coordinating meetups, that friction is real; the pre-planned upgrade is Expo/React Native into both stores for $124 once one metro shows traction, reusing the same TypeScript/React skills and backend.
Going Expo from day one is defensible but costs $124, Apple review (demo account, UGC moderation features, account deletion), and Google Play's 12-testers-for-14-days gate before a personal account can publish to production - a chicken-and-egg requirement for a team with no community yet.

**Verdict for shape (i), payments marketplace (deferred to v2 by issues #2 and #5): also web-first, and more decisively so.**
Stripe Connect onboarding, checkout, and seller dashboards are web flows; app stores add $124 plus marketplace review friction while contributing nothing to v1 distribution, and physical-goods payments are exempt from IAP commissions anyway (guideline 3.1.3(e), established in [payments-legal-trust.md](payments-legal-trust.md)).
Nothing in the delivery layer changes that shape's kill status; its blockers remain economics and operations, not platform.

**Finding 1: fully native (Swift/Kotlin) is ruled out on effort, and Expo is the only credible native path for this team.**
It would mean two new languages and two new platforms for a developer who has never shipped a mobile app, against a few hours per week during school.
Expo compiles real native apps from TypeScript/React, and EAS Build runs iOS builds on Expo's hosted macOS runners, so no Mac is required ([EAS Build docs](https://docs.expo.dev/build/introduction/)).
EAS's free tier covers this team's cadence: 15 Android and 15 iOS cloud builds per month on medium workers, and over-the-air updates to 1,000 monthly active users ([Expo pricing](https://expo.dev/pricing)).

**Finding 2: for card photos the web camera is at parity; for live scanning it is not, and v1 does not need live scanning.**
`getUserMedia` live camera streams work on iOS Safari 11+ over HTTPS, including installed PWAs since an iOS 13.4 fix ([MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia); [caniuse Stream API](https://caniuse.com/stream)).
But Safari has no ImageCapture API, so a web app cannot take a full-resolution still from a live stream on iOS; it can only grab video-resolution frames ([MDN ImageCapture](https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture); [caniuse: no Safari support](https://caniuse.com/imagecapture)), and torch/zoom/focus constraints are Chromium-only ([MDN MediaTrackConstraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints)).
The workaround is better than the live stream anyway for listings: `<input type="file" capture="environment">` opens the OS camera app itself, native quality included ([MDN capture attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)).
CollX-style real-time scan-to-identify needs live frame processing plus a recognition model, which is native territory (expo-camera ships photo capture, zoom, autofocus, torch, and barcode scanning; [expo-camera docs](https://docs.expo.dev/versions/latest/sdk/camera/)) - and it is a v2 feature in every plan this project has.

**Finding 3: push notifications are the real fork in the road.**
Web push is Baseline and free on Android/desktop browsers ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)).
On iOS it exists since 16.4 but only for web apps added to the Home Screen, with permission requested on a user gesture ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)); iOS 18.4 added the simpler Declarative Web Push, still for Home Screen web apps ([WebKit: Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)).
Native push has no such friction, and Expo's push service is itself free (600 notifications/second limit; [Expo push FAQ](https://docs.expo.dev/push-notifications/faq/)), but iOS push credentials are mandatory for production apps and are provisioned through an Apple Developer account, which means the $99/year membership ([Expo push FAQ](https://docs.expo.dev/push-notifications/faq/); [Apple enrollment](https://developer.apple.com/programs/enroll/)).
Net: reliable iOS notifications cost either install friction (PWA) or $99/year plus store review (native); there is no $0 frictionless option.

**Finding 4: app-store presence costs $124 in year one and its friction is concentrated in three named gates.**
Costs: Apple Developer Program $99/year, waived only for nonprofits/education/government ([Apple enrollment](https://developer.apple.com/programs/enroll/)); Google Play Console $25 one-time ([Play registration](https://support.google.com/googleplay/android-developer/answer/6112435)).
Gate 1 (Google, the surprise): personal developer accounts created after November 13, 2023 must run a closed test with at least 12 testers continuously opted in for 14 days before applying for production access, and the application review takes up to ~7 days ([Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)).
Gate 2 (Apple, marketplace-specific): guideline 1.2 requires UGC apps to ship content filtering, reporting, blocking, and support contact info before approval; 2.1 requires a working demo account with live backend for the reviewer; 5.1.1(v) requires in-app account deletion ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
Gate 3 (Apple, web-tech-specific): guideline 4.2 rejects apps that are repackaged websites without native-feeling functionality, so wrapping the PWA in a WebView to buy App Store presence is a rejection risk; Expo/React Native renders native UI and does not trip it ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
On the ticket's 3.1.1-vs-3.1.5 question: in the current guidelines the physical-goods carve-out is 3.1.3(e) (external payment required, 0% Apple cut, per issue #5), 3.1.3(d) covers person-to-person services, and 3.1.5 now covers cryptocurrencies; a no-payments meetup app touches none of the 3.1.x payment rules ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
D-U-N-S numbers are required only for organization accounts (both stores); individuals can enroll without one, at the cost of the personal legal name appearing as the seller ([Apple enrollment](https://developer.apple.com/programs/enroll/); [Play account types](https://support.google.com/googleplay/android-developer/answer/13628312)).
Apple states 90% of submissions are reviewed within 24 hours ([App Review page](https://developer.apple.com/app-store/review/); the page resisted automated retrieval during research, and the figure is corroborated by secondary coverage such as [RevenueCat's rejection guide](https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections), secondary).

**Finding 5: the free-tier hosting landscape has thinned; the launchable always-free stack is Supabase (or Neon for bare Postgres), and several famous names are traps.**
Fly.io no longer offers free allowances to new customers (smallest machine ~$2/month; [Fly pricing docs](https://fly.io/docs/about/pricing/)).
Render's free Postgres expires 30 days after creation, and free web services spin down after 15 idle minutes ([Render free docs](https://render.com/docs/free)).
Vercel's Hobby plan is "for personal, non-commercial use," which a marketplace is not ([Vercel pricing](https://vercel.com/pricing)).
AWS accounts created after July 15, 2025 get $100-200 in credits for at most 6 months instead of the legacy 12-month free tier ([AWS Free Tier](https://aws.amazon.com/free/); [AWS announcement](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits/)).
Supabase's free tier is a real launch platform (500 MB Postgres, 50k auth MAU, realtime, storage, edge functions) with two honest breaks: projects pause after 1 week of inactivity, and the 500 MB database is a 1-2 year runway once daily price snapshots accumulate ([Supabase pricing](https://supabase.com/pricing); snapshot math below).

**Finding 6: the budget math closes with room to spare.**
Shape (ii) web-first: $0/month hosting, $0 store fees, on top of issue #5's ~$130 compliance layer and issue #3's $0 data stack.
Shape (ii) with stores (day one or later): +$124 year one, +$99/year after, i.e. 12-25% of the partner's total budget annually.
First paid infrastructure line either way: Supabase Pro at $25/month, needed only after real growth ([Supabase pricing](https://supabase.com/pricing)).

---

## Camera access for card scanning: web vs native in detail

The v1 camera job, per the approved shape (ii), is photographing owned cards for listings and portfolio entries; catalog identification is search-by-name against the ~20k-card database from issue #3.

What mobile web can do today:

- Live camera preview in the page: `getUserMedia` over HTTPS with `facingMode: "environment"` and resolution constraints, supported on iOS Safari since 11 and all Android browsers ([MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia); [caniuse Stream API](https://caniuse.com/stream)).
  It works inside installed (Home Screen) PWAs on iOS since a 13.4-era fix; earlier standalone mode was broken, which is worth knowing only as history ([caniuse known issues](https://caniuse.com/stream)).
- Full-quality still photos: `<input type="file" accept="image/*" capture="environment">` hands off to the OS camera app and returns the captured file, i.e. native photo quality without native code; MDN notes the attribute is mobile-oriented and not Baseline across desktop browsers, which does not matter for a phone-first flow ([MDN capture attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)).

What mobile web cannot do on iOS:

- Programmatic full-resolution capture from a live stream: the ImageCapture API (`takePhoto()`) is Chromium-only (Chrome 59+, Edge, Samsung Internet); Safari has never shipped it and Firefox ships it disabled ([MDN ImageCapture](https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture); [caniuse](https://caniuse.com/imagecapture)).
  On iOS a web app can only draw video frames to a canvas, capped at video resolution.
- Camera control: `torch`, `zoom`, `focusMode`, and `focusDistance` constraints exist in the spec but are supported in Chromium browsers, not Safari ([MDN MediaTrackConstraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints)).

What native (Expo) adds: in-app photo capture with zoom, autofocus, torch, EXIF, plus built-in barcode scanning and the ecosystem for frame-level processing that real-time card recognition would need ([expo-camera docs](https://docs.expo.dev/versions/latest/sdk/camera/)).
Honest weighting: for v1 listing photos the web path is arguably better than an in-app camera (the OS camera app has the best autofocus/HDR on the phone); for a future scan-to-identify feature, native wins outright, and that feature should be treated as part of the Expo upgrade trigger, not a reason to start native.

## Push notifications: web vs native in detail

Meetup coordination (issue #2's surviving lane) is notification-shaped: trade proposals, chat replies, meetup confirmations and reminders.

- Android and desktop web: Push API + Notifications API via service worker, Baseline since March 2023, no fees, works from the browser without install ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)).
- iOS web: supported since iOS/iPadOS 16.4, but only for web apps added to the Home Screen with a standalone/fullscreen manifest, with the permission request tied to a user gesture; notifications then behave like native ones, including Badging ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
  iOS has no browser install prompt at all; the user must find Share -> Add to Home Screen themselves ([web.dev PWA installation](https://web.dev/learn/pwa/installation)).
  iOS 18.4 added Declarative Web Push (no service worker required), which simplifies the engineering but not the install friction ([WebKit: Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)).
- Native via Expo: expo-notifications plus Expo's free push service (FCM for Android, APNs for iOS; 600 notifications/second per project) ([Expo push overview](https://docs.expo.dev/push-notifications/overview/); [FAQ](https://docs.expo.dev/push-notifications/faq/)).
  iOS push keys exist only inside a paid Apple Developer membership, so native iOS push carries the $99/year regardless of store ambitions.

Design consequence for the web-first v1: treat Add-to-Home-Screen as an onboarding step ("install to get trade alerts"), ship web push for Android/desktop immediately, and accept that some iOS users will rely on opening the app; the moment metrics show iOS users missing time-sensitive trade coordination, that is the Expo trigger firing.

## App-store presence: what $124 buys and what review demands

What store presence buys a marketplace app: discoverability, a perception-of-legitimacy asset (issue #2 shows every funded competitor is in both stores), push without install friction, and the scan-camera ecosystem later.
What it does not buy: users; Double Holo has both store listings and 298 ratings five months in (issue #2).

Costs and enrollment friction:

- Apple: $99/year; individuals enroll with a verified legal name; organizations additionally need a D-U-N-S number, a domain-matched work email, and a public website ([Apple enrollment](https://developer.apple.com/programs/enroll/)).
- Google: $25 one-time; identity verification with government ID; organization accounts require a D-U-N-S number ([Play registration](https://support.google.com/googleplay/android-developer/answer/6112435); [account types](https://support.google.com/googleplay/android-developer/answer/13628312)).
- Google's production gate for new personal accounts: a closed test with 12+ testers opted in continuously for 14 days, then a production-access application reviewed in up to ~7 days ([Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)).
  For this team that gate is either a real cost (recruit 12 testers before having a product community) or an argument for forming the LLC from issue #5 first and registering an organization account, to which the personal-account testing requirement does not apply.

Review friction specific to a marketplace/UGC app (all from the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) unless noted):

- 1.2 (user-generated content): filtering, reporting with timely response, user blocking, and published support contact are required app features, not nice-to-haves; issue #5 already put these in the compliance layer, so they are shared cost, not new cost.
- 2.1 (completeness): a demo account with populated listings and a live backend must be provided to the reviewer; per Apple's own review page, most rejections are 2.1-class completeness issues (corroborating secondary: [RevenueCat](https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections)).
- 4.2 (minimum functionality): "your app should include features, content, and UI that elevate it beyond a repackaged website"; this is the guideline that makes wrap-the-PWA-in-a-WebView a false shortcut on iOS.
- 5.1.1(v): in-app account deletion is mandatory once accounts exist.
- Payments numbering, to close the ticket's question: physical-goods external payment is 3.1.3(e) (0% Apple cut, per issue #5), person-to-person services are 3.1.3(d), and 3.1.5 in the current guidelines covers cryptocurrencies, not physical goods.
- Google Play is symmetric on payments (Play Billing must not be used for physical goods, per issue #5) and applies standard app review plus the testing gate above.

One store-presence shortcut exists on Android only: a PWA can be packaged as a Trusted Web Activity and published to Google Play for the $25 fee, with the site verified via Digital Asset Links ([Chrome TWA docs](https://developer.chrome.com/docs/android/trusted-web-activity)); Apple has no equivalent, which is exactly the asymmetry the 4.2 note above describes.

## Development effort delta for this team

Ranked by new-things-to-learn for a strong TypeScript/React + Spring Boot/FastAPI/Postgres developer with zero mobile experience:

1. Responsive web/PWA: zero new stack; the PWA layer (manifest, service worker, push) is incremental and well-documented ([web.dev PWA course](https://web.dev/learn/pwa)).
2. Expo/React Native: same language, same React mental model, new rendering primitives and navigation idioms, plus the store-release process; EAS removes the Mac/Xcode/keystore burden (cloud iOS builds, managed signing; [EAS Build docs](https://docs.expo.dev/build/introduction/)) and the free tier's 15+15 builds/month fits a few-hours-per-week cadence ([Expo pricing](https://expo.dev/pricing)).
3. Native Swift + Kotlin: two unfamiliar platforms and languages, doubled UI work, no code sharing with a future web presence; ruled out for this team, and Expo makes the sacrifice unnecessary.

The backend delta matters as much as the frontend one: shape (ii) on Supabase needs no self-run server at all (Postgres, auth, realtime chat, storage, scheduled functions in the free tier), whereas running Kyle's familiar Spring Boot/FastAPI stack requires an always-on host, which is exactly what the free hosting tier no longer provides (Fly paid, Render cold-starts, AWS 6-month clock).
Learning Supabase's row-level security is a smaller cost than operating a server for $2-25/month with a few hours per week of attention; the FastAPI skills still apply to the price-sync job if it outgrows scheduled functions.

## Free-tier hosting: where each breaks

| Provider | Free tier today | Where it breaks | Source |
|---|---|---|---|
| Supabase | 500 MB Postgres, 50k auth MAU, 5 GB egress, 1 GB storage, 500k edge-function calls, realtime (200 concurrent), 2 projects | Pauses after 1 week inactivity; 500 MB DB vs growing price snapshots; next step $25/mo Pro | [Pricing](https://supabase.com/pricing) |
| Neon | 0.5 GB storage/project, 100 CU-hours/month, autosuspend after 5 min, 60k auth MAU | 100 CU-hours < ~183 CU-hours an always-awake minimum instance uses per month, so it breaks when traffic keeps the DB awake; storage same math as Supabase | [Pricing](https://neon.com/pricing) |
| Render | Free web services (spin down after 15 idle min, 750 hrs/mo), free static sites, free 1 GB Postgres | Free Postgres expires 30 days after creation (14-day grace), so it cannot host a launch database; cold starts on every idle wake | [Free docs](https://render.com/docs/free) |
| Vercel | Hobby: full platform, free forever | "Our Hobby plan is for personal, non-commercial use" - a marketplace is commercial, so the break is contractual, not technical; Pro is $20/user/mo | [Pricing](https://vercel.com/pricing) |
| Fly.io | None for new customers | No free tier to break; smallest machine ~$2/mo, volumes $0.15/GB/mo | [Pricing docs](https://fly.io/docs/about/pricing/) |
| AWS | Accounts after 2025-07-15: $100 credits + up to $100 earned, max 6 months; 30+ always-free services remain | The whole account converts to paid at month 6 or credit exhaustion; RDS is not in the always-free set; legacy 12-month tier only for pre-cutoff accounts | [Free Tier](https://aws.amazon.com/free/); [announcement](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits/) |

The snapshot math behind the Supabase/Neon break (structural estimate, own calculation): issue #3's architecture stores daily price snapshots for ~20k cards, which is ~7.3M rows/year; at realistic row-plus-index sizes that is on the order of 300-700 MB/year, so 500 MB of free Postgres holds roughly a year of naive daily snapshots plus the catalog.
The free-tier-preserving mitigations are standard: store only changed prices, or compact daily rows into weekly aggregates after 90 days; either extends the runway by years and costs an evening of SQL.
The pause-after-inactivity clause matters only pre-launch and for side projects; an app with any daily users never pauses, and the 2-active-project cap is irrelevant here.

The resulting $0/month reference stack for shape (ii): static frontend (React SPA/PWA) on Render's free static hosting, Supabase free tier as Postgres + auth + realtime chat + storage, price sync via scheduled function pulling TCGCSV/pokemontcg.io daily (issue #3), web push keys self-generated (VAPID, no fees).
Vercel would be the nicer DX for the frontend but is contractually out until $20/month; AWS is where Kyle's deploy experience lies but is no longer a $0 launch platform for a new account.
If a long-running server later becomes unavoidable (heavier sync jobs, image processing), Fly at ~$2-5/month is the cheapest escape hatch, well inside the partner's budget.

## The cheapest credible delivery path, per MVP shape

### Shape (ii), local-first trading - the live v1

Path: responsive web app + PWA on the $0 stack above; Expo/React Native + both stores as a pre-planned v1.5 upgrade triggered by metro traction or measured iOS notification pain; $0 now, $124 at the trigger.

Why this survives the kill-test: every v1 feature in the approved shape (listings with market-price context, portfolio, want/have matching, meetup coordination with chat, safety directory) is deliverable on web primitives; the camera need is stills (web parity); the notification gap is real but bounded to iOS pre-install; and the web app is itself the marketing site, shareable into the Facebook groups and Discords where the target users already are - a distribution property store apps do not have.

Honest failure points, stated as kill-conditions:

- If meetup coordination proves push-critical on iOS before any traction exists, the team pays $124 and enters store review earlier than planned; that money exists in the partner's budget, so this failure point costs time (Apple review, Google's 14-day test gate), not viability.
- If the partner's vision requires scan-to-identify at v1 (it should not, per issues #2 and #3), web delivery is the wrong platform and Expo becomes day-one, with the same $124 and gates.
- The $0 stack has two tolerated-dependency clauses in the same spirit as issue #3: Supabase can reprice its free tier, and the snapshot table eats the 500 MB runway; both have cheap pre-planned exits ($25/month Pro, snapshot compaction).
- What cannot be had at any price here: a frictionless $0 iOS notification channel; that option does not exist in 2026's platform landscape.

### Shape (i), payments marketplace - deferred v2

Path: the same web-first stack plus Stripe Connect; no store presence for v1 of this shape either; $0 delivery cost on top of the payments economics issue #5 already priced.

Why web-first is even clearer here: seller KYC onboarding, checkout, disputes, and tax flows are web surfaces (Stripe's hosted flows are web-native); guideline 3.1.3(e) means the stores add no payment advantage; and marketplace apps attract the heaviest review scrutiny (1.2 + 2.1 + demo accounts with live listings) at exactly the moment the product is least ready for it.
The delivery-layer failure point is the same iOS push gap, but shape (i)'s notifications (order updates, shipping) tolerate email/SMS fallbacks far better than time-sensitive meetup coordination does.
Nothing found in this research revives shape (i); its kill remains the one issues #2 and #5 delivered - negative unit economics at 0% fees and operational weight - and the cheapest credible delivery path is simply the one that adds no further fixed costs while that kill stands.
