# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm i -g npm@11.11.0

COPY package.json ./
COPY package-lock.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared/package.json packages/shared/package.json

ENV NPM_CONFIG_WORKSPACES=true
RUN npm ci --workspaces --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/bff ./apps/bff
COPY apps/admin ./apps/admin

ARG NEXT_PUBLIC_BFF_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_BFF_URL=${NEXT_PUBLIC_BFF_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN npm run --workspace packages/shared build
RUN npm run --workspace apps/bff build
RUN npm run --workspace apps/admin build

FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat nginx supervisor
WORKDIR /app
RUN npm i -g npm@11.11.0

COPY package.json ./
COPY package-lock.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared/package.json packages/shared/package.json

ENV NPM_CONFIG_WORKSPACES=true
RUN npm ci --omit=dev --workspaces --include-workspace-root

COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/apps/bff/dist /app/apps/bff/dist
COPY --from=builder /app/apps/admin/.next /app/apps/admin/.next
COPY --from=builder /app/apps/admin/public /app/apps/admin/public
COPY --from=builder /app/apps/admin/next.config.js /app/apps/admin/next.config.js

COPY infra/supervisord/supervisord.conf /etc/supervisord.conf
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
