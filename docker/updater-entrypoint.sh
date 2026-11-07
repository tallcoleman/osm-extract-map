#!/bin/sh
# Starts the updater: one run now if nothing has been published yet, then the schedule.
set -eu

crontab="${HOME:-/tmp}/crontab"
# The scheduled job fetches Geofabrik only. OSM-FR runs are manual (see the README).
printf '%s npm run update-data\n' "$CRON_SCHEDULE" > "$crontab"
supercronic -test "$crontab"

if [ ! -e "$DATA_DIR/current" ]; then
  echo "No release in $DATA_DIR yet: running a Geofabrik update now."
  npm run update-data || echo "First update failed; the schedule will try again." >&2
fi

exec supercronic -passthrough-logs "$crontab"
