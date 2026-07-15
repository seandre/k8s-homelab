FROM node:22.22.0-alpine AS build

RUN apk add --no-cache git

WORKDIR /workspace/docs-site/vitepress
COPY docs-site/vitepress/package.json ./package.json
COPY docs-site/vitepress/package-lock.json ./package-lock.json
RUN npm ci

COPY docs-site/vitepress ./
COPY docs /workspace/docs
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29.4-alpine

COPY docs-site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/docs-site/vitepress/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
