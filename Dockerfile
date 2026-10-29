# Stage 1: Build TanStack Start / Nitro application
FROM oven/bun:1-alpine AS build

WORKDIR /app

# Optional build-time URL overrides (can also be configured dynamically at runtime in Stage 2)
ARG VITE_SHUFFLE_API_URL
ENV VITE_SHUFFLE_API_URL=$VITE_SHUFFLE_API_URL

ARG VITE_SHUFFLE_CORE_URL
ENV VITE_SHUFFLE_CORE_URL=$VITE_SHUFFLE_CORE_URL

ARG VITE_SHUFFLE_SECURITY_URL
ENV VITE_SHUFFLE_SECURITY_URL=$VITE_SHUFFLE_SECURITY_URL

# Build standalone Node.js server using Nitro node-server preset
ENV NITRO_PRESET=node-server

COPY package.json bun.lock ./
RUN bun install --ignore-scripts

COPY . .
RUN bun run build

# Stage 2: Serve with Node.js + Nginx reverse proxy
FROM node:24.22.1-alpine

# Install nginx, openssl, gettext (for envsubst), and bash
RUN apk add --no-cache nginx openssl gettext bash

WORKDIR /app

# Remove default nginx configs
RUN rm /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true

# Bake a self-signed certificate into the image so the 443 listener works out of the box.
# It is regenerated at container start as well (see docker-entrypoint.sh) in case /etc/nginx is overlaid by a volume mount.
RUN openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout /etc/nginx/privkey.pem \
      -out /etc/nginx/fullchain.cert.pem \
      -subj "/CN=localhost"

# Copy project nginx config and template
COPY nginx.conf /app/nginx.conf.template
COPY nginx.conf /etc/nginx/nginx.conf.template

# Copy built server bundle and public assets
COPY --from=build /app/.output /app/.output
COPY --from=build /app/.output/public /usr/share/nginx/html

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# BACKEND_HOSTNAME is resolved at runtime via envsubst
ENV BACKEND_HOSTNAME=shuffle-backend
ENV PORT=3000
ENV NITRO_PORT=3000
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0

# Dynamic URL overrides for runtime container deployments:
# - SHUFFLE_CORE_URL / VITE_SHUFFLE_CORE_URL: Overrides the Shuffle Core frontend base URL
#     Cloud: https://shuffler.io (default)
#     On-Prem / Docker: http://<host>:3001 (default) or e.g. https://core.yourdomain.com
# - SHUFFLE_SECURITY_URL / VITE_SHUFFLE_SECURITY_URL: Overrides the Shuffle Security frontend base URL
# - SHUFFLE_API_URL / VITE_SHUFFLE_API_URL: Overrides backend API base URL
ENV SHUFFLE_CORE_URL=""
ENV SHUFFLE_SECURITY_URL=""
ENV SHUFFLE_API_URL=""

EXPOSE 80 443

ENTRYPOINT ["/app/docker-entrypoint.sh"]

