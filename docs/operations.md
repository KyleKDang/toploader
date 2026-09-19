# Operations

How the deployed app is wired to its vendors, and how to get the database back.
The vendors themselves, and why each was chosen, are in [ADR-0006](adr/0006-operational-vendors.md).

## Configuration

Every value below lives in exactly one place, and none of them is ever pasted into an issue or committed.
The backup passphrase is kept in the shared venture inbox from #32, beside the account passwords, because losing it makes every stored backup useless.

| Name | Where | Used by |
|---|---|---|
| `SUPABASE_DB_URL` | GitHub secret | CI `migrate`, nightly backup |
| `BACKUP_PASSPHRASE` | GitHub secret, and the shared inbox | nightly backup |
| `SENTRY_DSN` | GitHub secret | the cron check-ins of the nightly backup and the Catalog sync |
| `SUPABASE_SECRET_KEY` | GitHub secret | Catalog sync |
| `SUPABASE_URL` | GitHub variable | nightly backup (reads the hosted service versions), Catalog sync |
| `SUPABASE_PUBLISHABLE_KEY` | GitHub variable | nightly backup |
| `VITE_SUPABASE_URL` | Render env | the app |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Render env | the app |
| `VITE_SENTRY_DSN` | Render env | the app |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Render env | source map upload |
| `SENTRY_AUTH_TOKEN` | Render env | source map upload |

`SUPABASE_DB_URL` is the **session pooler** connection string from the Supabase dashboard's Connect panel, with the database password filled in.
The direct connection will not work from GitHub's runners: it is IPv6-only, and they are IPv4-only.

`SUPABASE_SECRET_KEY` is the secret API key from the Supabase dashboard's API Keys panel.
It acts as `service_role`, which bypasses RLS, so it exists only as this GitHub secret and never reaches the app.

The Supabase URL and publishable key ship in the app's JavaScript, so in GitHub they are variables rather than secrets.

## Hosted Auth settings

`supabase/config.toml` configures only the local stack; nothing in the repo reaches the hosted project's Auth settings.
They are set by hand in the Supabase dashboard, so they are listed here, and a change to any of them changes this table in the same commit.
Where a row has a local counterpart, the two must agree, or the tests pass against settings production does not have: #37 found the hosted code length at Supabase's default of 8 while `config.toml` and the app both said 6, which broke live sign-in.

| Setting | Dashboard location | Hosted value | Local counterpart |
|---|---|---|---|
| Site URL | Authentication → URL Configuration | `https://toploaderapp.com` | `site_url` (local address, differs on purpose) |
| Redirect URLs | Authentication → URL Configuration | `https://toploaderapp.com/**` only | `additional_redirect_urls` (local, differs on purpose) |
| Email OTP length | Authentication → Sign In / Providers → Email | `6` | `[auth.email] otp_length`; the app's code field (`SignUpScreen.tsx`) |
| Email OTP expiration | Authentication → Sign In / Providers → Email | `3600` seconds | `[auth.email] otp_expiry`; the template's "expires in an hour" |
| Custom SMTP | Authentication → Emails → SMTP Settings | `smtp.resend.com`, port `465`, user `resend`, password is the Resend key `supabase-auth-smtp` | none; locally, mail goes to Mailpit |
| Sender | Authentication → Emails → SMTP Settings | `Toploader <noreply@mail.toploaderapp.com>` | none |
| Confirm sign up template | Authentication → Emails → Templates | subject `Your Toploader code`, body `supabase/templates/sign-in-code.html` | `[auth.email.template.confirmation]` |
| Magic Link template | Authentication → Emails → Templates | subject `Your Toploader code`, body `supabase/templates/sign-in-code.html` | `[auth.email.template.magic_link]` |

Both templates carry the code because a first sign-in is a sign-up, so a new Trader gets the confirmation email and a returning one gets the magic link email.
Editing `sign-in-code.html` changes nothing in production until the new body is pasted into both hosted templates.

The Resend key is sending-only and scoped to `mail.toploaderapp.com`; it lives only in these SMTP settings.
The domain's DNS records, including SPF, DKIM and DMARC for `mail.`, are in Cloudflare, and #37 records each of them.

## What runs where

- **Every push:** `.github/workflows/ci.yml` runs every check.
- **Merge to `main`:** CI's `migrate` job applies new migrations to the hosted database; Render deploys the app once every check on the commit has passed (`render.yaml`).
- **Nightly, 10:17 UTC:** `.github/workflows/nightly-backup.yml` dumps and encrypts the database, keeps it as an artifact for 30 days, restores it into a throwaway stack to prove it restores, and checks in with the Sentry cron monitor `nightly-backup`.
  A failed run, or no run at all, raises a Sentry issue.
- **Daily, 21:23 UTC:** `.github/workflows/catalog-sync.yml` syncs the Catalog from TCGCSV, which publishes around 20:00 UTC, and checks in with the Sentry cron monitor `catalog-sync`.
  A set that fails keeps its last-good data and fails the run, so it raises a Sentry issue while every other set is still applied.
  It can be run by hand from the Actions tab, and running it twice in a day is harmless.

## Recovering the database

The backups are artifacts on the nightly backup's runs in GitHub Actions.
Each is `backup.tar.gz.gpg`, and holds the rows, the role settings, and the migration history, but not the schema: the migrations are the schema of record, because `supabase db dump` silently drops triggers on Supabase-managed tables such as `auth.users`.
Uploaded files in Storage are not in it, only their metadata rows.

To restore into a new hosted project:

1. Download the artifact, then run `scripts/backup/decrypt.sh backup.tar.gz.gpg restored` with `BACKUP_PASSPHRASE` set.
2. Check out the commit whose migrations match `restored/migrations.sql`, link the new project, and run `npx supabase db push` to build the schema.
3. With `psql` against the new project's session pooler URL, load `restored/roles.sql`, then, in one transaction, truncate the `public` tables the migrations seeded (the Cities) and load `restored/data.sql`.
   A new project's auth and storage tables start empty, so they need no truncating.
   `scripts/backup/restore.sh` does the same against a local stack every night, and is the reference for the steps.
4. Point Render's `VITE_SUPABASE_*` values and the GitHub secrets and variables at the new project.
5. Apply every row of [Hosted Auth settings](#hosted-auth-settings) to the new project; it starts on Supabase's defaults, and sign-in does not work until they are set.
