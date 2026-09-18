#!/usr/bin/env bash
# Dumps the hosted database and encrypts it: the nightly backup (ADR-0006).
#
#   SUPABASE_DB_URL=... SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... \
#   BACKUP_PASSPHRASE=... scripts/backup/dump.sh <out-dir>
#
# Writes <out-dir>/backup.tar.gz.gpg, which holds:
#   roles.sql        role settings, for restoring into a new hosted project
#   data.sql         every row, as COPY blocks
#   migrations.sql   the migration history, naming the schema data.sql fits
#   gotrue-version   the hosted Auth and Storage versions, which own the
#   storage-version  auth and storage schemas data.sql also fits
#
# The schema itself is not in the backup on purpose. `supabase db dump`
# leaves out triggers on Supabase-managed tables, including the one on
# auth.users that creates each Trader, so a dumped schema restores wrong
# without complaint. The migrations are the schema of record; restore.sh
# loads data.sql into a database built from them.
set -euo pipefail

out=${1:?usage: dump.sh <out-dir>}
: "${SUPABASE_DB_URL:?must be set}"
: "${SUPABASE_URL:?must be set}"
: "${SUPABASE_PUBLISHABLE_KEY:?must be set}"
: "${BACKUP_PASSPHRASE:?must be set}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

dump() { npx supabase db dump --db-url "$SUPABASE_DB_URL" "$@"; }
dump --role-only -f "$work/roles.sql"
dump --data-only --use-copy -f "$work/data.sql"
dump --data-only --use-copy -s supabase_migrations -f "$work/migrations.sql"

hosted() {
  curl -fsS -H "apikey: $SUPABASE_PUBLISHABLE_KEY" "$SUPABASE_URL$1"
}
hosted /auth/v1/health | jq -er .version >"$work/gotrue-version"
hosted /storage/v1/version >"$work/storage-version"

mkdir -p "$out"
tar -czf - -C "$work" . |
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-fd 3 -o "$out/backup.tar.gz.gpg" 3<<<"$BACKUP_PASSPHRASE"
