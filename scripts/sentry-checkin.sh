#!/usr/bin/env bash
# Checks a scheduled job in with its Sentry cron monitor (ADR-0006: a job's
# failure is a Sentry alert, not a silent one).
#
#   SENTRY_DSN=... scripts/sentry-checkin.sh <monitor> in_progress|ok|error
#
# Every check-in carries the monitor's config, so Sentry creates the monitor
# on the first one and this file stays its source of truth. Sentry alerts on
# an "error" check-in, and also when no check-in arrives at all, which is how
# a job that never ran gets noticed.
set -euo pipefail

usage='usage: sentry-checkin.sh <monitor> in_progress|ok|error'
monitor=${1:?$usage}
status=${2:?$usage}
: "${SENTRY_DSN:?must be set}"

# Each schedule is kept in step with the cron line of the job's workflow.
case $monitor in
  nightly-backup) schedule='17 10 * * *' ;;
  catalog-sync) schedule='23 21 * * *' ;;
  photo-reaper) schedule='41 8 * * *' ;;
  *) echo "unknown monitor: $monitor" >&2 && exit 1 ;;
esac

# A DSN is https://<public key>@<ingest host>/<project id>.
key=${SENTRY_DSN#https://}
key=${key%%@*}
host=${SENTRY_DSN#*@}
host=${host%%/*}
project=${SENTRY_DSN##*/}

curl -fsS -X POST -H 'Content-Type: application/json' \
  "https://$host/api/$project/cron/$monitor/$key/" \
  --data-raw "$(jq -n --arg status "$status" --arg schedule "$schedule" '{
    status: $status,
    monitor_config: {
      schedule: { type: "crontab", value: $schedule },
      timezone: "UTC",
      # GitHub runs scheduled jobs late under load, sometimes by an hour.
      checkin_margin: 120,
      max_runtime: 60,
      failure_issue_threshold: 1,
      recovery_threshold: 1
    }
  }')" >/dev/null
