#!/usr/bin/env bash
# Records raw TCGCSV responses for the seam-2 fixtures: the Pokemon set list,
# then the products and prices of the sets named. Output is the raw upstream
# JSON; tests/functions/fixtures/tcgcsv holds the trimmed copies.
#
#   scripts/catalog-sync/record-fixtures.sh <out dir> <groupId>...
set -euo pipefail

out=${1:?usage: record-fixtures.sh <out dir> <groupId>...}
shift
mkdir -p "$out"

# The same User-Agent the sync sends (sync.ts), and the pacing TCGCSV's FAQ
# asks for.
fetch() {
  curl -fsS -A 'toploader-catalog-sync/1.0 (+https://github.com/KyleKDang/toploader)' \
    "https://tcgcsv.com/tcgplayer/3/$1" -o "$out/$2"
  sleep 1
}

fetch groups groups.json
for group in "$@"; do
  fetch "$group/products" "$group-products.json"
  fetch "$group/prices" "$group-prices.json"
done
ls -l "$out"
