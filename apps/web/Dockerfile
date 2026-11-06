# apps/web production image. Build context = repo root (pnpm workspace: apps/web + packages/*).
#   docker build -f apps/web/Dockerfile .
FROM node:24-bookworm-slim
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY packages ./packages
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "web..."
COPY apps/web ./apps/web

# Public, build-time values (inlined into the browser bundle). Never put secrets here.
ARG NEXT_PUBLIC_MRA_MODE=mock
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_ISSUER_URL=
ARG NEXT_PUBLIC_RPC_URL=
ARG NEXT_PUBLIC_ANON_RPC=
ARG NEXT_PUBLIC_ANON_NETWORK=
ARG NEXT_PUBLIC_ANON_RPC_STRICT=
ARG NEXT_PUBLIC_LENDER_ACCOUNT=
ARG NEXT_PUBLIC_MRA_DEPLOYMENT=
ENV NEXT_PUBLIC_MRA_MODE=$NEXT_PUBLIC_MRA_MODE NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ISSUER_URL=$NEXT_PUBLIC_ISSUER_URL NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_ANON_RPC=$NEXT_PUBLIC_ANON_RPC NEXT_PUBLIC_ANON_NETWORK=$NEXT_PUBLIC_ANON_NETWORK \
    NEXT_PUBLIC_ANON_RPC_STRICT=$NEXT_PUBLIC_ANON_RPC_STRICT NEXT_PUBLIC_LENDER_ACCOUNT=$NEXT_PUBLIC_LENDER_ACCOUNT \
    NEXT_PUBLIC_MRA_DEPLOYMENT=$NEXT_PUBLIC_MRA_DEPLOYMENT \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @repo/sdk build && pnpm --filter web build

ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /repo/apps/web
CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
