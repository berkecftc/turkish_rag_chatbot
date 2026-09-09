# syntax=docker/dockerfile:1
# Multi-stage: build the SPA, serve with nginx. Dev mode is overridden in
# docker-compose.override.yml (vite dev server with HMR).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Unprivileged nginx: runs as the `nginx` user and listens on 8080 (non-root
# processes cannot bind :80). Upstream consumers (infra/nginx) target :8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
