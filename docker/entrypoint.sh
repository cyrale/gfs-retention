#!/bin/sh
# Entrypoint for the gfs-retention Docker image.
#
# It turns the CRON_SCHEDULE environment variable into a crontab and runs the
# CLI on that schedule through supercronic. Environment variables (S3_*,
# RETENTION, APPLY, TZ, ...) are inherited by the scheduled command.
set -eu

CRON_SCHEDULE="${CRON_SCHEDULE:-0 4 * * *}"

# supercronic requires a POSIX cron file. The command runs the compiled CLI.
CRONTAB_FILE="$(mktemp)"
printf '%s cd /app && node dist/index.js\n' "${CRON_SCHEDULE}" > "${CRONTAB_FILE}"

echo "gfs-retention: scheduling 'node dist/index.js' with schedule '${CRON_SCHEDULE}'"
if [ -z "${APPLY:-}" ]; then
  echo "gfs-retention: APPLY is not set, scheduled runs will be dry-runs."
fi

exec supercronic -passthrough-logs "${CRONTAB_FILE}"

