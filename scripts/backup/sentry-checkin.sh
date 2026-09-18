#!/usr/bin/env bash
# Checks the nightly backup in with its Sentry cron monitor (ADR-0006: the
# backup's failure is a Sentry alert, not a silent one).
#
#   SENTRY_DSN=... scripts/backup/sentry-checkin.sh in_progress|ok|error
#
# Every check-in carries the monitor's config, so Sentry creates the monitor
# on the first one and this file stays its source of truth. Sentry alerts on
# an "error" check-in, and also when no check-in arrives at all, which is how
# a job that never ran gets noticed.
set -euo pipefail

status=${1:?usage: sentry-checkin.sh in_progress|ok|error}
: "${SENTRY_DSN:?must be set}"

# A DSN is https://<public key>@<ingest host>/<project id>.
key=${SENTRY_DSN#https://}
key=${key%%@*}
host=${SENTRY_DSN#*@}
host=${host%%/*}
project=${SENTRY_DSN##*/}

curl -fsS -X POST -H 'Content-Type: application/json' \
  "https://$host/api/$project/cron/nightly-backup/$key/" \
  --data-raw "$(jq -n --arg status "$status" '{
    status: $status,
    monitor_config: {
      # Keep in step with the schedule in .github/workflows/nightly-backup.yml.
      schedule: { type: "crontab", value: "17 10 * * *" },
      timezone: "UTC",
      # GitHub runs scheduled jobs late under load, sometimes by an hour.
      checkin_margin: 120,
      max_runtime: 60,
      failure_issue_threshold: 1,
      recovery_threshold: 1
    }
  }')" >/dev/null
