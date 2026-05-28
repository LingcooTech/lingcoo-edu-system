ARG NODE_BASE_IMAGE=registry.access.redhat.com/ubi9/nodejs-22

FROM ${NODE_BASE_IMAGE} AS deps

USER 0
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY admin-ui/package*.json ./admin-ui/
RUN cd admin-ui && npm ci

COPY public-web/package*.json ./public-web/
RUN cd public-web && npm ci

FROM deps AS build

ARG VITE_API_BASE_URL=
ARG VITE_TENANT_SLUG=meizhi

COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle

COPY admin-ui ./admin-ui
RUN cd admin-ui && VITE_API_BASE_URL="${VITE_API_BASE_URL}" npm run build

COPY public-web ./public-web
RUN cd public-web && VITE_API_BASE_URL="${VITE_API_BASE_URL}" VITE_TENANT_SLUG="${VITE_TENANT_SLUG}" npm run build

RUN npm run build

FROM ${NODE_BASE_IMAGE} AS runtime

ARG APP_VERSION=development

USER 0
WORKDIR /app

ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="fd-edu-system"
LABEL org.opencontainers.image.source="https://github.com/FutureDecade/fd-edu-system"
LABEL org.opencontainers.image.version="${APP_VERSION}"

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist ./dist
COPY --from=build /app/admin-ui/dist ./admin-ui/dist
COPY --from=build /app/public-web/dist ./public-web/dist

RUN chown -R 1001:0 /app

USER 1001

EXPOSE 8090

CMD ["node", "dist/server.js"]
