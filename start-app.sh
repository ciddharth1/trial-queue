#!/bin/bash
set -e

echo "🔧 Queue Seva - Starting Services..."

# Kill any existing processes
pkill -f "bun.*socket-service" 2>/dev/null || true
pkill -f "next" 2>/dev/null || true
sleep 1

# ─── Database Setup ─────────────────────────────────────
echo "📦 Setting up database..."
cd /home/z/my-project

# Ensure database directory exists
mkdir -p db

# Push schema (creates tables if they don't exist)
npx prisma db push --accept-data-loss 2>&1 | tail -3

# Check if database needs seeding
USER_COUNT=$(npx prisma db execute --stdin 2>/dev/null <<< "SELECT COUNT(*) FROM User;" 2>/dev/null || echo "0")

# Seed if no users exist
if echo "$USER_COUNT" | grep -q "0"; then
  echo "🌱 Seeding database with demo data..."
  npx tsx prisma/seed.ts 2>&1 | tail -5
else
  echo "✅ Database already seeded"
fi

# ─── Start Socket.io Service ────────────────────────────
echo "🌐 Starting Socket.io service on port 3003..."
cd /home/z/my-project/mini-services/socket-service
JWT_SECRET=queue-seva-production-jwt-secret-2024-change-in-production \
  bun index.ts > /tmp/socket-service.log 2>&1 &
SOCKET_PID=$!
echo "Socket service PID: $SOCKET_PID"

# Wait for socket service to start
sleep 3

# ─── Start Next.js ──────────────────────────────────────
echo "🚀 Starting Next.js on port 3000..."
cd /home/z/my-project
npx next start -p 3000 > /tmp/next-prod.log 2>&1 &
NEXT_PID=$!
echo "Next.js PID: $NEXT_PID"

# Wait for Next.js to start
sleep 5

# ─── Verify Services ───────────────────────────────────
echo ""
echo "=== Service Status ==="
if curl -s http://localhost:3003/health > /dev/null 2>&1; then
  echo "✓ Socket.io service: RUNNING on port 3003"
else
  echo "✗ Socket.io service: FAILED (check /tmp/socket-service.log)"
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|30"; then
  echo "✓ Next.js app: RUNNING on port 3000"
else
  echo "✗ Next.js app: FAILED (check /tmp/next-prod.log)"
fi

# Quick API health check
echo ""
echo "=== API Health Check ==="
LOGIN_TEST=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@demo.com","password":"password"}' 2>/dev/null)

if echo "$LOGIN_TEST" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('success') else 1)" 2>/dev/null; then
  echo "✓ Login API: WORKING (user@demo.com / password)"
else
  echo "✗ Login API: FAILED"
  echo "  Response: $LOGIN_TEST" | head -c 200
fi

echo ""
echo "Press Ctrl+C to stop both services"

# Wait for either process to die
wait -n $SOCKET_PID $NEXT_PID 2>/dev/null || true
