# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm i -g npm@11.11.0

COPY package.json ./
COPY package-lock.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/shared/package.json packages/shared/package.json

ENV NPM_CONFIG_WORKSPACES=true
RUN npm ci --workspaces --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/bff ./apps/bff

RUN npm run --workspace packages/shared build
RUN npm run --workspace apps/bff build

FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat nginx supervisor
WORKDIR /app
RUN npm i -g npm@11.11.0

COPY package.json ./
COPY package-lock.json ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/shared/package.json packages/shared/package.json

ENV NPM_CONFIG_WORKSPACES=true
RUN npm ci --omit=dev --workspaces --include-workspace-root

COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/apps/bff/dist /app/apps/bff/dist

COPY infra/supervisord/supervisord.conf /etc/supervisord.conf
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
