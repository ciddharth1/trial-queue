#!/bin/bash
set -e

# Kill any existing processes
pkill -f "bun.*socket-service" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 1

# Start socket service
echo "Starting Socket.io service on port 3003..."
cd /home/z/my-project/mini-services/socket-service
exec bun index.ts > /tmp/socket-service.log 2>&1 &
SOCKET_PID=$!
echo "Socket service PID: $SOCKET_PID"

# Wait for socket service to start
sleep 3

# Start Next.js dev server
echo "Starting Next.js dev server on port 3000..."
cd /home/z/my-project
exec npx next dev -p 3000 > /tmp/next-dev.log 2>&1 &
NEXT_PID=$!
echo "Next.js dev server PID: $NEXT_PID"

# Wait for Next.js to start
sleep 5

# Verify both services
echo ""
echo "=== Service Status ==="
if curl -s http://localhost:3003/health > /dev/null 2>&1; then
  echo "✓ Socket.io service: RUNNING on port 3003"
else
  echo "✗ Socket.io service: FAILED"
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
  echo "✓ Next.js app: RUNNING on port 3000"
else
  echo "✗ Next.js app: FAILED"
fi

echo ""
echo "Press Ctrl+C to stop both services"

# Wait for either process to die
wait -n $SOCKET_PID $NEXT_PID 2>/dev/null || true
