#!/usr/bin/env bash
# Pins the next `supabase start` to the hosted Auth and Storage versions a
# backup recorded, so the auth and storage tables in its data.sql fit.
#
#   scripts/backup/pin-versions.sh <dir from decrypt.sh>
#
# The CLI reads the pins from supabase/.temp as Docker image tags, which
# always start with "v". Auth's health endpoint reports its version that
# way, but Storage's reports it bare ("1.73.1"), so both are normalized.
set -euo pipefail

dir=${1:?usage: pin-versions.sh <dir>}

mkdir -p supabase/.temp
for service in gotrue storage; do
  version=$(<"$dir/$service-version")
  echo "v${version#v}" >"supabase/.temp/$service-version"
done
