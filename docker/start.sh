#!/bin/sh
# ─── Queue Seva - Production Startup Script ─────────────
# Runs as the app container's CMD. Safe to re-run on every container start.
set -eu

echo "[start.sh] Initializing Queue Seva..."

# Refuse to start without required secrets.
: "${JWT_SECRET:?JWT_SECRET environment variable must be set (refusing to start with insecure defaults)}"
: "${DATABASE_URL:?DATABASE_URL environment variable must be set}"

# Wait for Postgres to accept connections (defensive — depends_on healthcheck
# already gates this, but a brief retry loop helps if the DB restarts).
echo "[start.sh] Waiting for database..."
for i in $(seq 1 30); do
  if node -e "const{Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1));" 2>/dev/null; then
    echo "[start.sh] Database is reachable."
    break
  fi
  if [ "$i" = "30" ]; then
    echo "[start.sh] Database is not reachable after 30 attempts. Aborting."
    exit 1
  fi
  sleep 2
done

# Push schema (creates tables on first run; safe to repeat — Prisma is idempotent for db push).
echo "[start.sh] Applying database schema..."
./node_modules/prisma/build/index.js db push --accept-data-loss --skip-generate

# Optional seed: opt-in only. Production must NOT auto-seed.
if [ "${SEED_ON_BOOT:-0}" = "1" ]; then
  echo "[start.sh] SEED_ON_BOOT=1 — running seed (idempotent)..."
  if [ -f "prisma/seed.js" ]; then
    node prisma/seed.js || echo "[start.sh] Seed failed (non-fatal)"
  elif [ -f "prisma/seed.ts" ]; then
    node --experimental-strip-types prisma/seed.ts || echo "[start.sh] Seed failed (non-fatal)"
  else
    echo "[start.sh] No seed script found, skipping"
  fi
else
  echo "[start.sh] Seed-on-boot disabled. Set SEED_ON_BOOT=1 to opt in."
fi

echo "[start.sh] Starting Next.js standalone server on :${PORT:-3000}..."
exec node server.js
