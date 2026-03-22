# ---- Build stage ----
FROM node:20-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/api/package.json ./packages/api/
COPY packages/factory/package.json ./packages/factory/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---- Runtime stage ----
FROM node:20-slim AS runtime

WORKDIR /app

RUN apt-get update && rm -rf /var/lib/apt/lists/* \
    && npm install -g pm2 pnpm

COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/factory/dist ./packages/factory/dist
COPY --from=build /app/packages/dashboard/dist ./packages/dashboard/dist
COPY --from=build /app/packages/dashboard/server.js ./packages/dashboard/server.js
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=build /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=build /app/packages/factory/node_modules ./packages/factory/node_modules
COPY --from=build /app/packages/dashboard/node_modules ./packages/dashboard/node_modules

RUN mkdir -p /app/sessions

EXPOSE 3001 5173
ENV NODE_ENV=production

COPY ecosystem.config.cjs ./
CMD ["pm2-runtime", "ecosystem.config.cjs"]
