# syntax=docker/dockerfile:1

# Base images are pinned by digest; the tag is kept beside it for reading.
# Update them deliberately (see docs/implementation-plan.md, Deployment).
ARG NODE_IMAGE=node:22.23.4-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202
ARG NGINX_IMAGE=nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# Same test stage as updater.Dockerfile: a failing check or test blocks the build.
FROM deps AS test
COPY . .
RUN npm run check && npm run test:coverage && touch /tested

FROM deps AS build
COPY . .
# Depending on the test stage makes BuildKit run it (it skips unused stages).
COPY --from=test /tested /tested
# Builds index.html only: the phase 2 debug map (web/debug.html) is never in dist/.
RUN npm run build && test ! -e web/dist/debug.html

FROM ${NGINX_IMAGE}
RUN apk add --no-cache jq
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
# The nginx image runs executable *.sh files in /docker-entrypoint.d/ before starting.
COPY --chmod=755 docker/web-entrypoint.sh /docker-entrypoint.d/40-config-json.sh
COPY --from=build /app/web/dist /usr/share/nginx/html
# Mount point for the data volume. Owned by the updater's node user (uid 1000), so
# the volume is writable by the updater even if this container creates it first.
RUN mkdir -p /srv/data && chown 1000:1000 /srv/data
