# The parent console as static files, served by Caddy next to the API it calls.
# Built from backend/docker-compose.yml (service caddy), not run on its own.

# glibc base, not alpine: TypeScript 7's compiler ships native per-platform binaries.
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Same origin as the API (Caddy proxies /api/*), so the console needs no CORS.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /src/dist /srv
