# syntax=docker/dockerfile:1

# ---- Build stage -----------------------------------------------------------
# Install all dependencies and compile TypeScript to dist/.
FROM node:26-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies to keep only what the runtime needs.
RUN npm prune --omit=dev

# ---- Runtime stage ---------------------------------------------------------
# Minimal image running the CLI on a schedule with supercronic as PID 1.
FROM node:26-slim AS runtime

ARG TARGETARCH
ENV SUPERCRONIC_VERSION=v0.2.51

# Download supercronic for the target architecture and verify its checksum.
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) SUPERCRONIC="supercronic-linux-amd64"; SHA1SUM="1692066e350a88ff4d7d6474fe3c7a6c41ec5e89" ;; \
      arm64) SUPERCRONIC="supercronic-linux-arm64"; SHA1SUM="9d4c2000493215a1898502b2fc2dada3e8ea8c7a" ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    rm -rf /var/lib/apt/lists/*; \
    curl -fsSL -o "/usr/local/bin/supercronic" \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/${SUPERCRONIC}"; \
    echo "${SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c -; \
    chmod +x /usr/local/bin/supercronic; \
    apt-get purge -y curl; \
    apt-get autoremove -y

WORKDIR /app

# Copy the compiled output and production dependencies from the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Run as a non-root user.
RUN useradd --create-home --uid 10001 app
USER app

# Default schedule: every day at 04:00. Overridable via CRON_SCHEDULE.
ENV CRON_SCHEDULE="0 4 * * *"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

