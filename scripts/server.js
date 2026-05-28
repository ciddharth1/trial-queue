/**
 * Custom production server that wraps the Next.js standalone server with
 * an embedded Socket.io server on the same HTTP port.
 *
 * Why: Railway deploys a single process per service. Running the socket
 * server as a separate microservice (the original `mini-services/socket-service`
 * setup) needs a second Railway service + a reverse proxy to route /socket.io/
 * to it. Embedding here means one deploy = the full realtime pipeline.
 *
 * Usage at runtime:
 *   node scripts/server.js
 *
 * The Next.js standalone bundle is consumed via require so we get the same
 * production behaviour as `node .next/standalone/server.js` would. We don't
 * fork a child process; we just intercept the HTTP server's listen() call so
 * we can attach Socket.io to the same instance before the handlers register.
 */

const path = require('path')
const http = require('http')
const { Server: IOServer } = require('socket.io')

// ─── Config ────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10)
const HOSTNAME = process.env.HOSTNAME || '0.0.0.0'

const JWT_SECRET = process.env.JWT_SECRET
const SOCKET_BROADCAST_SECRET = process.env.SOCKET_BROADCAST_SECRET || ''
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim())

if (!JWT_SECRET) {
  console.error('[server] FATAL: JWT_SECRET env var is required')
  process.exit(1)
}

// ─── Resolve paths ─────────────────────────────────────────────────────
// In Docker production, this script lives at /app/scripts/server.js but the
// standalone bundle is at /app/server.js. Try a few candidates so this works
// in dev, in CI, and in the Docker image.
const candidates = [
  path.resolve(__dirname, '..', 'server.js'),                    // Docker layout
  path.resolve(__dirname, '..', '.next', 'standalone', 'server.js'), // Local dev
]
let standalonePath = null
for (const p of candidates) {
  try { require.resolve(p); standalonePath = p; break } catch { /* keep trying */ }
}
if (!standalonePath) {
  console.error('[server] Cannot find Next.js standalone server.js. Looked in:', candidates)
  process.exit(1)
}
console.log('[server] Loading Next.js standalone bundle from', standalonePath)

// ─── Patch http.createServer so we can capture Next.js's HTTP server ────
// Next.js standalone calls http.createServer(handler).listen(port). We hook
// createServer, attach Socket.io to the returned instance, then return it.
const originalCreateServer = http.createServer
let attachedIO = null

http.createServer = function patchedCreateServer(...args) {
  const server = originalCreateServer.apply(http, args)
  if (!attachedIO) {
    attachedIO = attachIO(server)
  }
  return server
}

// ─── Socket.io setup ───────────────────────────────────────────────────
// Mirrors mini-services/socket-service/index.ts but lives in the same process.
// Re-implementing here in JS so we don't need to bundle/compile the TS service
// for production.
function attachIO(httpServer) {
  const jwt = require('jsonwebtoken')

  const io = new IOServer(httpServer, {
    path: '/socket.io/',
    cors: {
      origin: CORS_ORIGINS.length === 1 && CORS_ORIGINS[0] === '*' ? true : CORS_ORIGINS,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  })

  // ─── Custom HTTP handler for /broadcast — must run BEFORE Next.js so it
  // doesn't get a 404 from the Next router. We intercept at the request event
  // level: if the URL is /broadcast we handle it; otherwise let Next.js run.
  const originalListeners = httpServer.listeners('request').slice()
  httpServer.removeAllListeners('request')
  httpServer.on('request', (req, res) => {
    const urlPath = (req.url || '').split('?')[0]
    if (urlPath === '/broadcast' && req.method === 'POST') {
      handleBroadcast(req, res, io)
      return
    }
    if (urlPath === '/socket-health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'healthy',
        socketConnections: io.engine?.clientsCount || 0,
        timestamp: new Date().toISOString(),
      }))
      return
    }
    // Hand off to Next.js
    for (const listener of originalListeners) {
      listener(req, res)
    }
  })

  // ─── Auth middleware ─────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    if (!token) {
      console.warn('[socket] connection without token rejected')
      return next(new Error('No token'))
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      socket.user = payload
      next()
    } catch (err) {
      console.warn('[socket] invalid token rejected:', err.message)
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    const u = socket.user || {}
    console.log(`[socket] connect ${socket.id} userId=${u.userId} role=${u.role}`)

    socket.emit('connection:ack', {
      status: 'connected',
      socketId: socket.id,
      serverTime: new Date().toISOString(),
    })

    // Re-broadcast every event we receive so admin actions emitted from one
    // client land on all other clients. The Next.js API routes use
    // /broadcast (HTTP) which we handle below — that's the canonical path.
    // This client-emit path is supplementary.
    const eventsToRebroadcast = [
      'queue:join', 'queue:leave', 'queue:update',
      'token:created', 'token:called', 'token:serving',
      'token:completed', 'token:expired',
    ]
    for (const evt of eventsToRebroadcast) {
      socket.on(evt, (data) => {
        // Echo to all OTHER clients (not back to sender)
        socket.broadcast.emit(evt.replace('queue:update', 'queue:updated'), data)
      })
    }

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnect ${socket.id}: ${reason}`)
    })
  })

  console.log('[server] Socket.io attached to HTTP server on path /socket.io/')
  return io
}

// ─── /broadcast handler ────────────────────────────────────────────────
function handleBroadcast(req, res, io) {
  // Auth: when SOCKET_BROADCAST_SECRET is set, require the X-Broadcast-Secret
  // header to match. This is the path Next.js API routes use to push events.
  if (SOCKET_BROADCAST_SECRET) {
    const provided = req.headers['x-broadcast-secret']
    if (provided !== SOCKET_BROADCAST_SECRET) {
      console.warn('[broadcast] rejected: bad secret')
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
  }

  let body = ''
  req.on('data', (chunk) => { body += chunk.toString() })
  req.on('end', () => {
    try {
      const { event, data } = JSON.parse(body)
      if (!event) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing event' }))
        return
      }
      io.emit(event, data)
      console.log(`[broadcast] emit ${event} to ${io.engine?.clientsCount || 0} clients`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, event, timestamp: new Date().toISOString() }))
    } catch (err) {
      console.warn('[broadcast] bad payload:', err.message)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON' }))
    }
  })
}

// ─── Boot: load the Next.js standalone bundle ──────────────────────────
// This triggers the Next.js server to call http.createServer(...).listen(...)
// which our patched createServer above intercepts, attaching Socket.io.
process.env.PORT = String(PORT)
process.env.HOSTNAME = HOSTNAME
require(standalonePath)

// ─── Graceful shutdown ─────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`)
  if (attachedIO) {
    attachedIO.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  } else {
    process.exit(0)
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
