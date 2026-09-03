FROM registry.access.redhat.com/ubi9/nodejs-20 AS build

# UBI defaults to non-root uid 1001; COPY brings files in as root, so npm ci can't
# write node_modules. Build as root. (On-prem/OpenShift hardening: switch to
# non-root uid + COPY --chown=1001:0 to satisfy the restricted SCC — follow-up.)
USER root
WORKDIR /opt/app-root/src

COPY package.json package-lock.json ./
COPY contract/package.json contract/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY contract ./contract
COPY backend ./backend

RUN npm run build:contract \
  && npm -w @3f/backend run build

FROM registry.access.redhat.com/ubi9/nodejs-20 AS runtime

USER root
ENV NODE_ENV=production
WORKDIR /opt/app-root/src/backend

COPY --from=build /opt/app-root/src/package.json /opt/app-root/src/package-lock.json /opt/app-root/src/
COPY --from=build /opt/app-root/src/node_modules /opt/app-root/src/node_modules
COPY --from=build /opt/app-root/src/contract/package.json /opt/app-root/src/contract/package.json
COPY --from=build /opt/app-root/src/contract/dist /opt/app-root/src/contract/dist
COPY --from=build /opt/app-root/src/backend/package.json ./
COPY --from=build /opt/app-root/src/backend/node_modules ./node_modules
COPY --from=build /opt/app-root/src/backend/dist ./dist
COPY --from=build /opt/app-root/src/backend/drizzle ./drizzle

EXPOSE 4000

CMD ["node", "dist/main.js"]
