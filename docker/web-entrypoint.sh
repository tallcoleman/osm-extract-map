#!/bin/sh
# Writes the runtime files from the environment, so settings can change without
# rebuilding the image:
# - config.json with the MapTiler key (jq escapes the value);
# - index.html from the build's copy, plus the link preview tags that need an
#   absolute URL (og:url, og:image) when SITE_URL is set;
# - the Umami script tag and the matching CSP origin when UMAMI_SCRIPT_URL and
#   UMAMI_WEBSITE_ID are set.
set -eu

html=/usr/share/nginx/html

if [ -z "${MAPTILER_KEY:-}" ]; then
  echo "WARNING: MAPTILER_KEY is not set; the basemap will not load." >&2
fi
jq -n --arg k "${MAPTILER_KEY:-}" '{maptilerKey: $k}' > "$html/config.json"

site_url="${SITE_URL:-}"
site_url="${site_url%/}"
cp /usr/share/nginx/index.template.html "$html/index.html"
if [ -z "$site_url" ]; then
  echo "NOTE: SITE_URL is not set; link previews will have no image." >&2
# Only plain URL characters, so the value is safe in sed and in an HTML attribute.
elif ! printf '%s' "$site_url" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~-]+)*$'; then
  echo "WARNING: SITE_URL is not a plain http(s) URL ('$site_url'); link previews will have no image." >&2
else
  tags="<meta property=\"og:url\" content=\"$site_url/\" />"
  tags="$tags<meta property=\"og:image\" content=\"$site_url/og-image.png\" />"
  tags="$tags<meta property=\"og:image:width\" content=\"1200\" /><meta property=\"og:image:height\" content=\"630\" />"
  tags="$tags<meta property=\"og:image:alt\" content=\"OSM Extracts Map\" />"
  sed -i \
    -e "s|</head>|$tags</head>|" \
    -e 's|<meta name="twitter:card" content="summary" />|<meta name="twitter:card" content="summary_large_image" />|' \
    "$html/index.html"
  grep -q 'og:image"' "$html/index.html" || echo "WARNING: couldn't add the link preview tags to index.html." >&2
fi

# Analytics. The CSP snippet is written either way, so an unset or invalid value
# leaves the strict policy.
umami_url="${UMAMI_SCRIPT_URL:-}"
umami_id="${UMAMI_WEBSITE_ID:-}"
analytics_origin=""
if [ -z "$umami_url" ] && [ -z "$umami_id" ]; then
  echo "NOTE: UMAMI_SCRIPT_URL is not set; analytics are off." >&2
# Same plain URL check as SITE_URL, and a script path is required.
elif ! printf '%s' "$umami_url" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~-]+)+$'; then
  echo "WARNING: UMAMI_SCRIPT_URL is not a plain http(s) script URL ('$umami_url'); analytics are off." >&2
elif ! printf '%s' "$umami_id" | grep -Eq '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'; then
  echo "WARNING: UMAMI_WEBSITE_ID is not a UUID ('$umami_id'); analytics are off." >&2
else
  analytics_origin=$(printf '%s' "$umami_url" | grep -Eo '^https?://[^/]+')
  sed -i "s|</head>|<script defer src=\"$umami_url\" data-website-id=\"$umami_id\"></script></head>|" "$html/index.html"
  grep -q 'data-website-id=' "$html/index.html" || echo "WARNING: couldn't add the analytics script to index.html." >&2
fi
sed "s| __ANALYTICS_ORIGIN__|${analytics_origin:+ $analytics_origin}|g" \
  /etc/nginx/security-headers.template.conf > /etc/nginx/snippets/security-headers.conf
