# Operational vendors, and self-managed backups on the free tier

The spec named a vendor for hosting, the database, and price data, but left the operational surface unpinned: transactional email was "e.g. Resend", the registrar lived only in ticket [#34](https://github.com/KyleKDang/pokemon/issues/34)'s body, error monitoring did not exist anywhere, and nothing said what happens when the Supabase free tier loses the database.
This ADR pins all four, keeping the $0/month launch constraint of [ADR-0002](0002-web-first-pwa.md).
Decided in the operational grilling on ticket [#35](https://github.com/KyleKDang/pokemon/issues/35).

## Registrar: Cloudflare Registrar

Wholesale pricing with no markup and no promotional first year, WHOIS privacy included, no upsells; roughly $10-12/year for a `.com`.
Porkbun is the fallback if a standalone registrar is ever preferred.
Registrars advertising a cheap first year are avoided on principle: the renewal price is the only price that matters over the life of the project.
The one consequence is that Cloudflare Registrar requires Cloudflare to host the domain's DNS, which is free and is where the Render and email records go anyway.

## Transactional email: Resend, carrying Supabase Auth's mail too

Resend's free tier is 3,000 emails/month capped at **100/day** with one verified domain.
The daily cap, not the monthly one, is the number that breaks first and is therefore the named trigger for the $20/month tier.

Resend is chosen over the alternatives because it covers both mail paths with one vendor and one authenticated domain:
an HTTP API for the Deno edge functions that send the notification matrix, and SMTP credentials for Supabase Auth's custom SMTP.
That second path is not optional and was not previously written down anywhere: Supabase's built-in Auth mailer is rate-limited to a handful of messages per hour and cannot serve production signup confirmation or password reset.

Mail is sent from a **subdomain**, `mail.<domain>`, with SPF, DKIM and DMARC on that subdomain rather than the apex.
This isolates trade-notification deliverability from anything the partner later sends from the apex, so a complaint rate on announcements can never sink a meetup-confirmed email.
DMARC starts at `p=none` with reporting and tightens to `p=quarantine` once DKIM alignment is confirmed in the wild.
The From address is `noreply@mail.<domain>`; the Reply-To is the support address, which is a [#36](https://github.com/KyleKDang/pokemon/issues/36) question.

### Considered options

- **AWS SES**: effectively free at this volume at $0.10 per 1,000, and the named fallback if volume outgrows Resend, but it requires a sandbox-exit review and carries more ops for no benefit at launch scale.
- **Brevo**: a higher daily cap at roughly 300/day, kept in reserve if the 100/day limit binds before the volume justifies paying.
- **Postmark**: the best transactional deliverability, but a 100/month free tier is unusable here.
- **Mailgun and SendGrid**: free tiers no longer meaningful for new accounts.

## Error monitoring: Sentry, free Developer plan

A failing trade RPC in production is currently invisible, which for the heart of the product is not acceptable at any price including free.
Sentry's Developer plan is $0 forever at 5,000 errors/month and one dashboard user, which is enough for one City and one reviewing founder.
Events past the cap are silently dropped rather than billed, so the free plan cannot generate a surprise invoice.
Sentry covers the SPA and the edge functions; Postgres RPC failures surface as errors on the calling client, which is the seam that matters because it is where a Trader experiences them.

The single-user limit is a real constraint worth stating: only one founder can triage in the dashboard, which lines up with the same founder holding admin rights in [ADR-0007](0007-admin-authorization.md), and is another decision that resolves once [#36](https://github.com/KyleKDang/pokemon/issues/36) names people.

## Backups: self-managed, because the free tier has none

The Supabase free tier provides **no automated backups and no point-in-time recovery**, and there is no snapshot the platform is holding on our behalf.
Free projects also **pause after 7 days with no database activity**, and a paused project with no backup is how free-tier projects lose data outright.
Buying the vendor answer means Supabase Pro at $25/month for a rolling seven daily backups, which the spec already reserves as the first paid line only after real growth.

So until Pro is justified, backups are ours: a nightly GitHub Actions cron runs `pg_dump` against the project and stores the encrypted dump as a retained artifact.
The same job doubles as the keepalive, because connecting to the database is exactly the activity that resets the 7-day pause clock.
One scheduled job therefore closes both holes, at $0 on GitHub's free private-repo minutes.
Once the daily price sync ships it keeps the project active on its own, but the backup job remains the thing that makes the database recoverable.

## Consequences

- Every vendor line in the spec's Architecture section now names a product, with no remaining "e.g.".
- Three named cost triggers exist where there were none: Resend's 100 emails/day, Sentry's 5,000 errors/month, and Supabase Pro for backups and storage.
- The nightly dump is load-bearing infrastructure, not a convenience: on the free tier it is the only recovery path that exists. Its failure is a Sentry alert, not a silent one.
- Cloudflare hosts DNS, so the SPF, DKIM and DMARC records for Resend and the Render record for the app all live in one place.
