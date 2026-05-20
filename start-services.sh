#!/bin/bash
# Start Queue Seva services

# Kill any existing instances
pkill -f "next dev" 2>/dev/null
pkill -f "socket-service" 2>/dev/null
sleep 2

# Start Socket.io service
cd /home/z/my-project/mini-services/socket-service
nohup bun --hot index.ts > /tmp/socket-service.log 2>&1 &
echo "Socket.io PID: $!"

# Start Next.js dev server
cd /home/z/my-project
nohup node node_modules/.bin/next dev -p 3000 > /tmp/next-dev.log 2>&1 &
echo "Next.js PID: $!"

sleep 5
echo "=== Socket.io Log ==="
cat /tmp/socket-service.log
echo ""
echo "=== Next.js Log ==="
cat /tmp/next-dev.log
