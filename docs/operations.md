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
| `SENTRY_DSN` | GitHub secret | nightly backup's cron check-in |
| `SUPABASE_URL` | GitHub variable | nightly backup (reads the hosted service versions) |
| `SUPABASE_PUBLISHABLE_KEY` | GitHub variable | nightly backup |
| `VITE_SUPABASE_URL` | Render env | the app |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Render env | the app |
| `VITE_SENTRY_DSN` | Render env | the app |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Render env | source map upload |
| `SENTRY_AUTH_TOKEN` | Render env | source map upload |

`SUPABASE_DB_URL` is the **session pooler** connection string from the Supabase dashboard's Connect panel, with the database password filled in.
The direct connection will not work from GitHub's runners: it is IPv6-only, and they are IPv4-only.

The Supabase URL and publishable key ship in the app's JavaScript, so in GitHub they are variables rather than secrets.

## What runs where

- **Every push:** `.github/workflows/ci.yml` runs every check.
- **Merge to `main`:** CI's `migrate` job applies new migrations to the hosted database; Render deploys the app once every check on the commit has passed (`render.yaml`).
- **Nightly, 10:17 UTC:** `.github/workflows/nightly-backup.yml` dumps and encrypts the database, keeps it as an artifact for 30 days, restores it into a throwaway stack to prove it restores, and checks in with the Sentry cron monitor `nightly-backup`.
  A failed run, or no run at all, raises a Sentry issue.

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
