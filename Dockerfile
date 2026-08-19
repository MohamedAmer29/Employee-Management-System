# =============================================================================
# EMS Backend - production image
#
# Three stages:
#   deps  -> installs the full dependency tree (needed to compile TypeScript)
#   build -> compiles NestJS to dist/
#   prod  -> runtime image containing only production dependencies + dist/
#
# Splitting deps from build means the (slow) npm ci layer is only re-executed
# when package.json / package-lock.json change, not on every source edit.
# =============================================================================

ARG NODE_VERSION=22-alpine


# -----------------------------------------------------------------------------
# Stage 1: dependencies (dev + prod)
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

# Build toolchain for native addons (bcrypt). Installed only in this throwaway
# stage so the compilers never reach the final image.
RUN apk add --no-cache python3 make g++

# Copy manifests first so this layer is cached independently of the source.
COPY package.json package-lock.json ./

# npm ci installs exactly what package-lock.json specifies - reproducible, and
# faster than npm install because it skips dependency resolution.
RUN npm ci


# -----------------------------------------------------------------------------
# Stage 2: build
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Only the files `nest build` actually needs.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# Produces dist/
RUN npm run build

# Re-resolve node_modules down to production dependencies only. This is copied
# verbatim into the final stage, so devDependencies never ship.
RUN npm prune --omit=dev


# -----------------------------------------------------------------------------
# Stage 3: production runtime
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS production

# wget is used by the container HEALTHCHECK below.
# dumb-init reaps zombies and forwards SIGTERM to Node, which lets Nest run its
# shutdown hooks (closing Redis and PostgreSQL connections cleanly).
RUN apk add --no-cache dumb-init wget

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# The official Node images ship a non-root "node" user (uid 1000).
# Owning /app lets the app write runtime files without running as root.
RUN chown -R node:node /app

# Copy as `node` so no chown pass is needed afterwards.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./

# Drop root before running the application.
USER node

EXPOSE 3000

# Hits the existing GET /health endpoint (HealthModule), which reports both
# PostgreSQL and Redis status. It returns 503 only when PostgreSQL is down;
# a Redis outage is reported as degraded but still healthy, which is the
# correct behaviour for a container liveness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "run", "start:prod"]
