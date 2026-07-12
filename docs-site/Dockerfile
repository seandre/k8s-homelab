FROM node:22.22.0-alpine AS build

WORKDIR /workspace/docs-site/docusaurus
COPY docs-site/docusaurus/package.json ./package.json
COPY docs-site/docusaurus/package-lock.json ./package-lock.json
RUN npm ci

COPY docs-site/docusaurus ./
COPY docs /workspace/docs
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29.4-alpine

COPY --from=build /workspace/docs-site/docusaurus/build /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
