FROM public.ecr.aws/docker/library/node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM public.ecr.aws/docker/library/node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/node:24-alpine AS api
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=160
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
RUN mkdir -p /var/lib/wise/media && chown -R node:node /var/lib/wise
USER node
EXPOSE 3000
CMD ["node","server/index.mjs"]

FROM public.ecr.aws/docker/library/caddy:2-alpine AS web
COPY --from=builder /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
