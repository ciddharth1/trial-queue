# Task 6: Socket.io Real-Time Service for Queue Seva

## Summary
Built a complete Socket.io mini-service at `/home/z/my-project/mini-services/socket-service/` that handles real-time queue management events for the Queue Seva platform.

## Files Created

### `/home/z/my-project/mini-services/socket-service/package.json`
- Dependencies: `socket.io@^4.8.1`, `jsonwebtoken@^9.0.2`
- DevDependencies: `bun-types@^1.1.0`
- Dev script: `bun --hot index.ts`

### `/home/z/my-project/mini-services/socket-service/index.ts`
Complete Socket.io server with the following features:

## Features Implemented

### 1. Connection Management
- **JWT Authentication**: Users must provide a JWT token in `handshake.auth.token` or `handshake.query.token`. Token is verified using `jsonwebtoken` with a configurable secret (`JWT_SECRET` env var).
- **Room Management**: Users join rooms based on queues (`queue:{queueId}`), organizations (`org:{organizationId}`), and admin groups (`admin:{organizationId}`).
- **Disconnect Handling**: Properly cleans up room memberships, notifies remaining members, and tracks connected users.

### 2. Queue Events
- `queue:join` - User joins a queue room, optionally joins admin/org rooms
- `queue:leave` - User leaves a queue room
- `queue:update` - Broadcast queue state changes (QUEUE_UPDATED, QUEUE_PAUSED, QUEUE_RESUMED, QUEUE_CLOSED) - Admin/Counter staff only
- `queue:position_changed` - Notify position changes to queue members - Admin/Counter staff only
- `queue:closed` - Notify queue closure, cleans up room tracking - Admin only

### 3. Token Events
- `token:created` - New token generated, broadcast to queue room
- `token:called` - Token called to counter - Admin/Counter staff only
- `token:serving` - Token being served - Admin/Counter staff only
- `token:completed` - Token service completed - Admin/Counter staff only
- `token:expired` - Token expired (TIMEOUT, NO_SHOW, CANCELLED)

### 4. Admin Events
- `admin:dashboard` - Admin dashboard updates with real-time metrics - Admin only
- `admin:stats` - Real-time stats (HOURLY, DAILY, WEEKLY) - Admin only

### 5. Utility Events
- `ping/pong` - Latency measurement
- `rooms:get` - Get current room membership
- `counters:register` - Register a service counter to an organization
- `connection:ack` - Connection acknowledgment with user info

### 6. Health & Monitoring
- `/health` endpoint via `io.engine.use()` middleware - returns service status, uptime, connections, active queues
- `/ready` endpoint - readiness check
- Periodic health logging every 60 seconds

### 7. Robustness
- **Role-based access control**: Admin, Counter Staff, and User roles with appropriate permissions
- **Error handling**: Try-catch on all event handlers with structured error responses
- **Graceful shutdown**: SIGTERM/SIGINT handlers that notify clients before disconnecting
- **Uncaught exception handling**: Process-level error handlers
- **State tracking**: In-memory maps for connected users, queue room members, and organization counters

## Technical Notes

### Engine.io Middleware for Health Checks
Since Socket.io with `path: '/'` intercepts ALL HTTP requests (required for Caddy gateway routing), standard HTTP server callbacks don't work. The solution uses `io.engine.use()` middleware to intercept `/health` and `/ready` requests before Engine.io processes them.

### Gateway Integration
- Frontend connects via: `io("/?XTransformPort=3003", { auth: { token: jwtToken } })`
- Caddy routes based on `XTransformPort` query parameter
- Path is always `/` for proper Caddy routing

## Service Status
- Port: 3003
- Health endpoint tested and working: `curl http://localhost:3003/health`
- Ready endpoint tested and working: `curl http://localhost:3003/ready`
- Dependencies installed successfully
