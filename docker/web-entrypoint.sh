#!/bin/sh
# Writes the runtime config.json from the environment, so the MapTiler key can
# change without rebuilding the image. jq escapes the value.
set -eu

if [ -z "${MAPTILER_KEY:-}" ]; then
  echo "WARNING: MAPTILER_KEY is not set; the basemap will not load." >&2
fi
jq -n --arg k "${MAPTILER_KEY:-}" '{maptilerKey: $k}' > /usr/share/nginx/html/config.json
