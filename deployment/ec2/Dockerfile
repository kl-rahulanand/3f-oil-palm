# One multi-stage build, two runnable targets: `backend` and `frontend`.
# Build context is the REPO ROOT (see docker-compose.yml), because this is an npm
# workspace - contract, backend and frontend share one lockfile and the backend
# imports @3f/contract, so a per-package context cannot resolve it.

# ---------------------------------------------------------------- deps
FROM node:22-alpine AS deps
WORKDIR /app
# Only the manifests, so a source edit does not re-run the install layer.
COPY package.json package-lock.json ./
COPY contract/package.json contract/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

# ---------------------------------------------------------------- build
# Chained from `deps` rather than copying node_modules across: npm workspaces
# HOIST to the root, so contract/node_modules does not exist at all and a
# per-workspace COPY fails the build. Inheriting the layer is both simpler and
# exactly what `npm ci` produced.
FROM deps AS build
WORKDIR /app
COPY . .

# The browser calls the backend directly (frontend/src/lib/api.ts:27 reads
# NEXT_PUBLIC_API_BASE_URL), and Next inlines NEXT_PUBLIC_* at BUILD time - so
# this is a build argument, not a runtime variable. It must be the URL the
# BROWSER can reach, which on EC2 is the instance's public address, never a
# container name.
ARG NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm run build:contract \
 && npm run build:backend \
 && npm run build:frontend

# ---------------------------------------------------------------- backend
# Also chained from `deps`, for the same hoisting reason. This keeps devDeps in
# the image, which is larger than a pruned runtime would be - acceptable for a
# demo box, and noted in the README rather than hidden.
FROM deps AS backend
WORKDIR /app
ENV NODE_ENV=development
COPY --from=build /app/contract/dist contract/dist
COPY --from=build /app/backend/dist backend/dist
# Drizzle reads its SQL at RUNTIME from two separate folders, resolved relative
# to the compiled file: backend/drizzle for the application database
# (db/migrate.ts) and backend/drizzle-warehouse for the warehouse
# (warehouse/warehouse-migrate.ts:29, which also reads seed-proof.sql from it).
# Both are needed; shipping only the first fails with "Can't find
# meta/_journal.json" AFTER the app migration has already succeeded.
COPY --from=build /app/backend/drizzle backend/drizzle
COPY --from=build /app/backend/drizzle-warehouse backend/drizzle-warehouse
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------- frontend
FROM deps AS frontend
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/contract/dist contract/dist
COPY --from=build /app/frontend/.next frontend/.next
# No frontend/public in this repo - checked, not assumed; a COPY of it would fail.
COPY --from=build /app/frontend/next.config.ts frontend/next.config.ts
WORKDIR /app/frontend
EXPOSE 3000
# -H 0.0.0.0 because the repo's dev script binds 127.0.0.1, which inside a
# container is reachable only from the container itself.
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
