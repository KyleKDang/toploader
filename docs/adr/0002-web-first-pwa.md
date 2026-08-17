# Web-first PWA delivery, with a named trigger for the app-store upgrade

v1 ships as a mobile-first responsive web app installable as a PWA, on free static hosting, at $0.
The Expo/React Native + both-stores upgrade ($124 first year, already budgeted) fires on a named trigger, not vibes: first-city traction, or metrics showing iOS users missing time-sensitive trade coordination because they skipped Add-to-Home-Screen.
Decided jointly with the partner in Founder Questionnaire #2; the full platform analysis is in [docs/research/delivery-platforms.md](../research/delivery-platforms.md).

## Consequences

- The one real capability gap is iOS push: it works only for Home-Screen-installed web apps and iOS shows no install prompt, so install instructions are an onboarding step and email is the reliability floor for proposal/accept/confirm events.
- Fully native Swift/Kotlin is ruled out permanently for this team; Expo reuses the TypeScript/React skills and EAS builds need no Mac.
- Keeping business logic server-side (ADR-0001) and out of components is what makes the later Expo rewrite a views-only rewrite.
