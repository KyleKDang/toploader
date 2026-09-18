#!/usr/bin/env bash
# Decrypts a backup from dump.sh into a directory, ready for restore.sh.
#
#   BACKUP_PASSPHRASE=... scripts/backup/decrypt.sh <backup.tar.gz.gpg> <dir>
set -euo pipefail

backup=${1:?usage: decrypt.sh <backup.tar.gz.gpg> <dir>}
dir=${2:?usage: decrypt.sh <backup.tar.gz.gpg> <dir>}
: "${BACKUP_PASSPHRASE:?must be set}"

mkdir -p "$dir"
gpg --batch --quiet --decrypt --passphrase-fd 3 "$backup" 3<<<"$BACKUP_PASSPHRASE" |
  tar -xzf - -C "$dir"
