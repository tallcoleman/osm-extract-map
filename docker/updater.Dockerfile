# syntax=docker/dockerfile:1

# Base image pinned by digest; the tag is kept beside it for reading.
ARG NODE_IMAGE=node:22.23.4-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm skips an optional platform package quietly if its download fails, and the
# broken layer would then be cached. Loading each native tool here fails the step instead.
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && node -e 'require("lightningcss"); require("rolldown")' \
 && npx tsc -v && npx oxlint --version

# Same test stage as web.Dockerfile: a failing check or test blocks the build.
FROM deps AS test
COPY . .
RUN npm run check && npm run test:coverage && touch /tested

# supercronic from a pinned release, checked against the SHA1 published with it
# (and the SHA-256 GitHub records for the asset). The build fails on a mismatch.
FROM ${NODE_IMAGE} AS supercronic
ARG TARGETARCH
ARG SUPERCRONIC_VERSION=v0.2.50
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) sha1=0795da10bf6303e9680a2c2bd8dd6b9aa33ebda2; sha256=d2d7c97fbfefc763d5bbcbbb3f8d61f9dd3410ce5d05a737c414994b80b8cdd0 ;; \
      arm64) sha1=e0023a0346354a153a4a2708c657308890823d14; sha256=a1c0af9872e8de89a1ce5c1b596e26c42917d5a2cf914d98faee2e28156899e2 ;; \
      *) echo "No supercronic checksum for $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    wget -q -O /supercronic "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}"; \
    echo "$sha1  /supercronic" | sha1sum -c -; \
    echo "$sha256  /supercronic" | sha256sum -c -; \
    chmod 755 /supercronic

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    DATA_DIR=/data \
    CACHE_DIR=/cache \
    CRON_SCHEDULE="0 3 * * 1"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY shared ./shared
COPY updater ./updater
# Tests and one-off exploration scripts don't ship.
RUN rm -rf updater/explore && find updater shared -name '*.test.ts' -delete
COPY --from=supercronic /supercronic /usr/local/bin/supercronic
COPY --chmod=755 docker/updater-entrypoint.sh /usr/local/bin/updater-entrypoint.sh
COPY docker/updater-healthcheck.mjs /usr/local/lib/updater-healthcheck.mjs
# Depending on the test stage makes BuildKit run it (it skips unused stages).
COPY --from=test /tested /tested
# Volume mount points, owned by node so new named volumes are too.
RUN mkdir -p /data /cache && chown node:node /data /cache
USER node
ENTRYPOINT ["updater-entrypoint.sh"]
