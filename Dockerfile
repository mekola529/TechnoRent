# ─── Build stage: Client ────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --legacy-peer-deps
COPY client/ ./
RUN npm run build

# ─── Build stage: Server ────────────────────────────
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate
RUN npx tsc

# ─── Production stage ───────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy server
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/package.json ./server/
COPY --from=server-build /app/server/prisma ./server/prisma

# Copy client build
COPY --from=client-build /app/client/dist ./client/dist

WORKDIR /app/server

# Run migrations & start
ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate resolve --rolled-back 20260325000000_add_service_requests_rent_orders 2>/dev/null; npx prisma migrate deploy && npx prisma db seed && node dist/index.js"]
