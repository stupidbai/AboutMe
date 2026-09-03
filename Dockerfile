FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY config ./config
COPY site ./site
COPY scripts ./scripts
COPY THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="白云飞个人知识与合作门户" \
      org.opencontainers.image.version="4.0.0"

ENV NODE_ENV=production \
    CASE_ADMIN_HOST=0.0.0.0 \
    CASE_ADMIN_PORT=4173 \
    CASE_DATA_DIR=/data \
    CASE_BACKUP_LIMIT=10 \
    CASE_SESSION_HOURS=8 \
    COMMUNITY_SESSION_DAYS=30

WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/config/cases.json ./config/cases.json
COPY --from=build --chown=node:node /app/config/site-config.json ./config/site-config.json
COPY --from=build --chown=node:node /app/config/knowledge.json ./config/knowledge.json
COPY --from=build --chown=node:node /app/scripts/serve-with-admin.mjs ./scripts/serve-with-admin.mjs
COPY --from=build --chown=node:node /app/scripts/database.mjs ./scripts/database.mjs
COPY --from=build --chown=node:node /app/scripts/case-schema.mjs ./scripts/case-schema.mjs
COPY --from=build --chown=node:node /app/scripts/site-config-schema.mjs ./scripts/site-config-schema.mjs
COPY --from=build --chown=node:node /app/scripts/knowledge-schema.mjs ./scripts/knowledge-schema.mjs
COPY --from=build --chown=node:node /app/scripts/rag-service.mjs ./scripts/rag-service.mjs
COPY --from=build --chown=node:node /app/scripts/network-security.mjs ./scripts/network-security.mjs
COPY --from=build --chown=node:node /app/scripts/community-service.mjs ./scripts/community-service.mjs
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md

RUN mkdir -p /data/backups && chown -R node:node /data
USER node

VOLUME ["/data"]
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "scripts/serve-with-admin.mjs"]
