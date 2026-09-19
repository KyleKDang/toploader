#!/usr/bin/env bash
# Trims raw recordings (record-fixtures.sh) down to the products the seam-2
# suite names, keeping every upstream field of the ones it keeps. Run it from
# the repo root, where the fixtures directory below resolves.
#
#   scripts/catalog-sync/trim-fixtures.sh <raw dir> <groupId>:<id,id,...> ...
set -euo pipefail

raw=${1:?usage: trim-fixtures.sh <raw dir> <groupId>:<productId,...> ...}
shift
out=tests/functions/fixtures/tcgcsv
groups='[]'

for spec in "$@"; do
  group=${spec%%:*}
  ids="[${spec#*:}]"
  mkdir -p "$out/$group"
  for file in products prices; do
    jq --argjson ids "$ids" '
      .results |= map(select(.productId as $id | $ids | index($id)))
      | if .totalItems then .totalItems = (.results | length) else . end
    ' "$raw/$group-$file.json" >"$out/$group/$file.json"
  done
  groups=$(jq -c --argjson group "$group" '. + [$group]' <<<"$groups")
done

jq --argjson groups "$groups" '
  .results |= map(select(.groupId as $id | $groups | index($id)))
  | .totalItems = (.results | length)
' "$raw/groups.json" >"$out/groups.json"
