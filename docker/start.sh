#!/bin/sh
# ─── Queue Seva - Production Startup Script ─────────────
# Runs as the app container's CMD. Safe to re-run on every container start.
set -eu

echo "[start.sh] Initializing Queue Seva..."

# Refuse to start without required secrets.
: "${JWT_SECRET:?JWT_SECRET environment variable must be set (refusing to start with insecure defaults)}"
: "${DATABASE_URL:?DATABASE_URL environment variable must be set}"

# Wait for Postgres to accept connections.
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

# Push schema.
echo "[start.sh] Applying database schema..."
./node_modules/prisma/build/index.js db push --accept-data-loss --skip-generate

# Optional seed: opt-in only.
if [ "${SEED_ON_BOOT:-0}" = "1" ]; then
  echo "[start.sh] SEED_ON_BOOT=1 — running seed (idempotent)..."
  if [ -f "prisma/seed.js" ]; then
    node prisma/seed.js || echo "[start.sh] Seed failed (non-fatal)"
  elif [ -f "prisma/seed.ts" ]; then
    node --experimental-strip-types prisma/seed.ts || echo "[start.sh] Seed failed (non-fatal)"
  fi
fi

# Start the embedded Next.js + Socket.io server. Single process, single port.
echo "[start.sh] Starting Next.js + embedded Socket.io on :${PORT:-3000}..."
exec node scripts/server.js
