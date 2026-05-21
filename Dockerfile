# ─── Queue Seva - Multi-stage Docker Build ─────────────

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN npm ci --ignore-scripts

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL=file:./db/custom.db
ENV JWT_SECRET=queue-seva-production-jwt-secret-2024-change-in-production

RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma schema and generated client for runtime DB operations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy seed script for database initialization
COPY --from=builder /app/prisma/seed.ts ./prisma/seed.ts

# Create data directory for SQLite database
RUN mkdir -p /app/db && chown nextjs:nodejs /app/db

# Copy the startup script
COPY --chmod=755 <<'EOF' /app/start.sh
#!/bin/sh
set -e

echo "🔧 Initializing Queue Seva..."

# Ensure database directory exists
mkdir -p /app/db

# Push schema to create tables (safe to run repeatedly)
echo "📦 Setting up database schema..."
npx prisma db push --accept-data-loss 2>/dev/null || echo "DB push skipped (may already exist)"

# Seed the database if empty (check if any users exist)
USER_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count().then(c => { console.log(c); p.\$disconnect(); });
" 2>/dev/null || echo "0")

if [ "$USER_COUNT" = "0" ]; then
  echo "🌱 Seeding database with demo data..."
  npx tsx prisma/seed.ts 2>/dev/null || npx ts-node prisma/seed.ts 2>/dev/null || echo "Seed failed - you may need to seed manually"
else
  echo "✅ Database already seeded ($USER_COUNT users found)"
fi

echo "🚀 Starting Queue Seva..."
exec node server.js
EOF

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/start.sh"]
