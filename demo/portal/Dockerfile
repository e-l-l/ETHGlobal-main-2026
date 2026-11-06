# syntax=docker/dockerfile:1.7
# Demo seller portal (Next.js). Built by deploy/docker-compose.yml.
# SESSION_SECRET and the other settings come from deploy/env/demo-portal.env at runtime.
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY . .
# Never build with a developer's local env files or a host (macOS) node_modules / .next.
RUN rm -rf node_modules .next .env .env.* tsconfig.tsbuildinfo
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=2048
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /srv/portal
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=build --chown=node:node /src ./
USER node
EXPOSE 3000
CMD ["npm", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
