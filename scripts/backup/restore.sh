#!/usr/bin/env bash
# Restores a decrypted backup into a Supabase database whose schema was built
# from this repo's migrations, then proves every row arrived.
#
#   scripts/backup/restore.sh <dir from decrypt.sh>
#
# The target is the database of a running `supabase start`, the container
# supabase_db_toploader unless RESTORE_DB_CONTAINER names another. Start it
# on the hosted services' versions first, or the auth and storage tables in
# the backup will not fit it:
#
#   cp <dir>/gotrue-version <dir>/storage-version supabase/.temp/
#
# The nightly job does exactly that in a throwaway stack. A real recovery
# builds a new project's schema with `supabase db push`, then loads roles.sql
# and data.sql the same way with psql.
#
# It refuses a backup taken at a different migration than the target: the
# data only fits the schema it was dumped from.
set -euo pipefail

dir=${1:?usage: restore.sh <dir>}
container=${RESTORE_DB_CONTAINER:-supabase_db_toploader}

# The superuser, since the auth and storage tables belong to their services'
# own roles, which `postgres` cannot empty or write.
psql() {
  docker exec -i "$container" \
    psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -X -q "$@"
}

# Each COPY block's table, and how many rows it carries.
copy_counts() {
  awk '/^COPY / { table = $2; n = 0; next }
       /^\\\.$/ { if (table) print table, n; table = ""; next }
       table { n++ }' "$1" | sort
}

backup_migrations=$(awk '
  /^COPY / { inside = 1; next } /^\\\.$/ { inside = 0 }
  inside { print $1 }' "$dir/migrations.sql" | sort)
target_migrations=$(psql -At -c \
  'select version from supabase_migrations.schema_migrations order by 1')
if [[ "$backup_migrations" != "$target_migrations" ]]; then
  echo "The backup was taken at different migrations than the target has." >&2
  diff <(echo "$backup_migrations") <(echo "$target_migrations") >&2 || true
  exit 1
fi

# Replace, not merge: migrations seed rows too (the Cities), so every dumped
# table is emptied first, in the same transaction that loads it.
expected=$(copy_counts "$dir/data.sql")
tables=$(cut -d' ' -f1 <<<"$expected" | paste -sd, -)
{
  echo "truncate $tables cascade;"
  cat "$dir/data.sql"
} | psql --single-transaction >/dev/null

actual=$(while read -r table _; do
  echo "$table $(psql -At -c "select count(*) from $table" </dev/null)"
done <<<"$expected")
if [[ "$expected" != "$actual" ]]; then
  echo "Restored row counts differ from the backup's." >&2
  diff <(echo "$expected") <(echo "$actual") >&2 || true
  exit 1
fi

echo "Restored $(wc -l <<<"$expected" | tr -d ' ') tables," \
  "$(awk '{ n += $2 } END { print n }' <<<"$expected") rows, all accounted for."
