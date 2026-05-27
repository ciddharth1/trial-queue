import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'

// ============================================================================
// Types
// ============================================================================

interface JwtPayload {
  userId: string
  email: string
  // Roles align with the Next.js app: USER, ADMIN, SUPER_ADMIN.
  // COUNTER_STAFF kept as a forward-compatible value if added later.
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' | 'COUNTER_STAFF'
  name: string
  iat?: number
  exp?: number
}

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload
}

interface QueueJoinData {
  queueId: string
  organizationId?: string
}

interface QueueLeaveData {
  queueId: string
}

interface QueueUpdateData {
  queueId: string
  organizationId: string
  updateType: 'QUEUE_UPDATED' | 'QUEUE_PAUSED' | 'QUEUE_RESUMED' | 'QUEUE_CLOSED'
  data: Record<string, unknown>
  timestamp: string
}

interface PositionChangeData {
  queueId: string
  tokenId: string
  previousPosition: number
  currentPosition: number
  estimatedWaitMinutes?: number
  timestamp: string
}

interface QueueClosedData {
  queueId: string
  organizationId: string
  reason?: string
  timestamp: string
}

interface TokenCreatedData {
  queueId: string
  tokenId: string
  tokenNumber: string
  userId: string
  position: number
  estimatedWaitMinutes?: number
  timestamp: string
}

interface TokenCalledData {
  queueId: string
  tokenId: string
  tokenNumber: string
  counterId: string
  counterName: string
  userId?: string
  timestamp: string
}

interface TokenServingData {
  queueId: string
  tokenId: string
  tokenNumber: string
  counterId: string
  counterName: string
  userId?: string
  timestamp: string
}

interface TokenCompletedData {
  queueId: string
  tokenId: string
  tokenNumber: string
  counterId: string
  counterName: string
  userId?: string
  timestamp: string
}

interface TokenExpiredData {
  queueId: string
  tokenId: string
  tokenNumber: string
  reason: 'TIMEOUT' | 'NO_SHOW' | 'CANCELLED'
  timestamp: string
}

interface AdminDashboardData {
  organizationId: string
  activeQueues: number
  totalTokensToday: number
  completedTokensToday: number
  averageWaitMinutes: number
  activeCounters: number
  timestamp: string
}

interface AdminStatsData {
  organizationId: string
  period: 'HOURLY' | 'DAILY' | 'WEEKLY'
  stats: {
    totalTokens: number
    completedTokens: number
    expiredTokens: number
    averageWaitMinutes: number
    averageServiceMinutes: number
    peakHour: string
  }
  timestamp: string
}

interface ErrorResponse {
  event: string
  error: string
  message: string
  timestamp: string
}

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT || '3003', 10)
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start with insecure defaults.')
  process.exit(1)
}
const _jwtSecret: string = JWT_SECRET // TypeScript-safe reference after guard
const ADMIN_ROOM_PREFIX = 'admin'
const QUEUE_ROOM_PREFIX = 'queue'
const ORG_ROOM_PREFIX = 'org'

// ============================================================================
// State Management
// ============================================================================

interface ConnectedUser {
  socketId: string
  userId: string
  name: string
  email: string
  role: string
  connectedAt: Date
  rooms: Set<string>
}

const connectedUsers = new Map<string, ConnectedUser>()
const queueRoomMembers = new Map<string, Set<string>>()
const organizationCounters = new Map<string, Set<string>>()

// ============================================================================
// Utility Functions
// ============================================================================

function getQueueRoom(queueId: string): string {
  return `${QUEUE_ROOM_PREFIX}:${queueId}`
}

function getAdminRoom(organizationId: string): string {
  return `${ADMIN_ROOM_PREFIX}:${organizationId}`
}

function getOrgRoom(organizationId: string): string {
  return `${ORG_ROOM_PREFIX}:${organizationId}`
}

function getTimestamp(): string {
  return new Date().toISOString()
}

function createErrorResponse(event: string, error: string, message: string): ErrorResponse {
  return { event, error, message, timestamp: getTimestamp() }
}

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, _jwtSecret) as unknown as JwtPayload
  } catch {
    return null
  }
}

function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: Record<string, unknown>) {
  const timestamp = getTimestamp()
  const prefix = `[${timestamp}] [${level}]`
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data))
  } else {
    console.log(`${prefix} ${message}`)
  }
}

function getQueueMemberCount(queueId: string): number {
  return queueRoomMembers.get(queueId)?.size ?? 0
}

function getOnlineUserCount(): number {
  return connectedUsers.size
}

// Privilege helpers — accept SUPER_ADMIN everywhere ADMIN is accepted.
function isAdmin(role: string): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

function isStaff(role: string): boolean {
  return isAdmin(role) || role === 'COUNTER_STAFF'
}

// ============================================================================
// HTTP Server & Socket.io Setup
// ============================================================================

// ============================================================================
// HTTP Request Handler (BEFORE Socket.io)
// We handle health check and broadcast endpoints on the raw HTTP server
// BEFORE passing requests to Socket.io. This is critical because io.engine.use()
// only intercepts requests under the Socket.io path (e.g., /socket.io/),
// so /health and /broadcast would never be reached through engine middleware.
// We use a reference to `io` that gets set after creation.
// ============================================================================

const httpServer = createServer()

// CORS: restrict to known origins in production, allow all in development
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['*']

const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 10000,
  allowUpgrades: true,
  transports: ['websocket', 'polling']
})

// ============================================================================
// HTTP Request Handler for non-Socket.io endpoints
// We listen on the 'request' event and intercept requests BEFORE Socket.io.
// Socket.io only handles requests to /socket.io/ path, so we handle
// /health, /ready, and /broadcast here.
// ============================================================================

httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
  // Strip XTransformPort query parameter from URL (added by Caddy gateway)
  if (req.url && req.url.includes('XTransformPort=')) {
    try {
      const parsed = new URL(req.url, 'http://localhost')
      parsed.searchParams.delete('XTransformPort')
      req.url = parsed.pathname + (parsed.search ? parsed.search : '')
    } catch {
      req.url = req.url.replace(/[?&]XTransformPort=[^&]*/, '').replace(/&&/g, '&').replace(/\?$/, '')
    }
  }

  const urlPath = (req.url || '').split('?')[0]

  // Only intercept our custom endpoints - let Socket.io handle everything else
  if (urlPath.startsWith('/socket.io')) return

  // Health check endpoint
  if (urlPath === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'queue-seva-socket',
      uptime: process.uptime(),
      connections: getOnlineUserCount(),
      activeQueues: queueRoomMembers.size,
      timestamp: getTimestamp()
    }))
    return
  }

  // Readiness check endpoint
  if (urlPath === '/ready' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ready',
      timestamp: getTimestamp()
    }))
    return
  }

  // Broadcast endpoint - allows Next.js API routes to trigger socket events
  // POST /broadcast with JSON body { event, data }
  // Authenticated via X-Broadcast-Secret header when SOCKET_BROADCAST_SECRET is set.
  if (urlPath === '/broadcast' && req.method === 'POST') {
    const expectedSecret = process.env.SOCKET_BROADCAST_SECRET
    const providedSecret = req.headers['x-broadcast-secret']
    if (expectedSecret) {
      if (typeof providedSecret !== 'string' || providedSecret !== expectedSecret) {
        log('WARN', 'Rejected /broadcast: invalid or missing shared secret', { remote: req.socket.remoteAddress })
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
    } else if (process.env.NODE_ENV === 'production') {
      // In production, refuse broadcasts when no shared secret is configured.
      log('ERROR', 'Refusing /broadcast in production: SOCKET_BROADCAST_SECRET is not set')
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Broadcast disabled: server misconfigured' }))
      return
    }
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try {
        const { event, data } = JSON.parse(body)
        if (!event) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing event name' }))
          return
        }
        // Broadcast to all connected clients
        io.emit(event, data)
        log('INFO', 'Server-side broadcast triggered', { event, emittedBy: 'api-route' })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, event, timestamp: getTimestamp() }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      }
    })
    return
  }

  // Unknown path
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found', endpoints: ['/health', '/ready', '/broadcast', '/socket.io/'] }))
})

// ============================================================================
// Authentication Middleware
// ============================================================================

io.use((socket: AuthenticatedSocket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token as string | undefined

  if (!token) {
    log('WARN', 'Connection rejected: No token provided', { socketId: socket.id })
    return next(new Error('Authentication required: No token provided'))
  }

  const decoded = verifyToken(token)

  if (!decoded) {
    log('WARN', 'Connection rejected: Invalid token', { socketId: socket.id })
    return next(new Error('Authentication failed: Invalid or expired token'))
  }

  socket.user = decoded
  log('INFO', 'User authenticated via JWT', {
    socketId: socket.id,
    userId: decoded.userId,
    role: decoded.role
  })

  next()
})

// ============================================================================
// Connection Handler
// ============================================================================

io.on('connection', (socket: AuthenticatedSocket) => {
  if (!socket.user) {
    log('ERROR', 'Connected socket without user data, disconnecting', { socketId: socket.id })
    socket.disconnect(true)
    return
  }

  const { userId, name, email, role } = socket.user

  // Register connected user
  const connectedUser: ConnectedUser = {
    socketId: socket.id,
    userId,
    name,
    email,
    role,
    connectedAt: new Date(),
    rooms: new Set()
  }
  connectedUsers.set(socket.id, connectedUser)

  log('INFO', 'User connected', {
    socketId: socket.id,
    userId,
    name,
    role,
    totalOnline: getOnlineUserCount()
  })

  // Auto-join admin room if user is admin
  if (isAdmin(role) && socket.user) {
    // Admin will explicitly join organization-specific admin rooms
    log('INFO', 'Admin user connected, will join admin rooms on queue:join', {
      socketId: socket.id,
      userId
    })
  }

  // Send connection acknowledgment
  socket.emit('connection:ack', {
    status: 'connected',
    socketId: socket.id,
    userId,
    serverTime: getTimestamp()
  })

  // ========================================================================
  // Queue Events
  // ========================================================================

  /**
   * queue:join - User joins a queue room to receive updates for that queue
   */
  socket.on('queue:join', (data: QueueJoinData) => {
    try {
      if (!data.queueId) {
        socket.emit('error', createErrorResponse('queue:join', 'MISSING_QUEUE_ID', 'Queue ID is required'))
        return
      }

      const queueRoom = getQueueRoom(data.queueId)
      socket.join(queueRoom)

      // Track room membership
      connectedUser.rooms.add(queueRoom)
      if (!queueRoomMembers.has(data.queueId)) {
        queueRoomMembers.set(data.queueId, new Set())
      }
      queueRoomMembers.get(data.queueId)!.add(socket.id)

      // Join admin room if applicable
      if (data.organizationId && isAdmin(role)) {
        const adminRoom = getAdminRoom(data.organizationId)
        socket.join(adminRoom)
        connectedUser.rooms.add(adminRoom)
        log('INFO', 'Admin joined admin room', { socketId: socket.id, adminRoom })
      }

      // Join organization room for all users
      if (data.organizationId) {
        const orgRoom = getOrgRoom(data.organizationId)
        socket.join(orgRoom)
        connectedUser.rooms.add(orgRoom)
      }

      // Notify the user they've joined successfully
      socket.emit('queue:joined', {
        queueId: data.queueId,
        memberCount: getQueueMemberCount(data.queueId),
        timestamp: getTimestamp()
      })

      // Notify others in the queue room
      socket.to(queueRoom).emit('queue:member_joined', {
        queueId: data.queueId,
        userId,
        memberCount: getQueueMemberCount(data.queueId),
        timestamp: getTimestamp()
      })

      log('INFO', 'User joined queue room', {
        socketId: socket.id,
        userId,
        queueId: data.queueId,
        memberCount: getQueueMemberCount(data.queueId)
      })
    } catch (error) {
      log('ERROR', 'Error in queue:join', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('queue:join', 'INTERNAL_ERROR', 'Failed to join queue'))
    }
  })

  /**
   * queue:leave - User leaves a queue room
   */
  socket.on('queue:leave', (data: QueueLeaveData) => {
    try {
      if (!data.queueId) {
        socket.emit('error', createErrorResponse('queue:leave', 'MISSING_QUEUE_ID', 'Queue ID is required'))
        return
      }

      const queueRoom = getQueueRoom(data.queueId)
      socket.leave(queueRoom)

      // Update room membership tracking
      connectedUser.rooms.delete(queueRoom)
      const members = queueRoomMembers.get(data.queueId)
      if (members) {
        members.delete(socket.id)
        if (members.size === 0) {
          queueRoomMembers.delete(data.queueId)
        }
      }

      // Notify the user they've left
      socket.emit('queue:left', {
        queueId: data.queueId,
        timestamp: getTimestamp()
      })

      // Notify remaining members
      socket.to(queueRoom).emit('queue:member_left', {
        queueId: data.queueId,
        userId,
        memberCount: getQueueMemberCount(data.queueId),
        timestamp: getTimestamp()
      })

      log('INFO', 'User left queue room', {
        socketId: socket.id,
        userId,
        queueId: data.queueId,
        remainingMembers: getQueueMemberCount(data.queueId)
      })
    } catch (error) {
      log('ERROR', 'Error in queue:leave', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('queue:leave', 'INTERNAL_ERROR', 'Failed to leave queue'))
    }
  })

  /**
   * queue:update - Broadcast queue state changes to all members
   */
  socket.on('queue:update', (data: QueueUpdateData) => {
    try {
      if (!data.queueId || !data.updateType) {
        socket.emit('error', createErrorResponse('queue:update', 'MISSING_FIELDS', 'queueId and updateType are required'))
        return
      }

      // Only admins and counter staff can broadcast queue updates
      if (!isStaff(role)) {
        socket.emit('error', createErrorResponse('queue:update', 'FORBIDDEN', 'Only admins and counter staff can update queue state'))
        return
      }

      const updatePayload: QueueUpdateData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const queueRoom = getQueueRoom(data.queueId)
      io.to(queueRoom).emit('queue:updated', updatePayload)

      // Also emit to admin room if organizationId is provided
      if (data.organizationId) {
        const adminRoom = getAdminRoom(data.organizationId)
        io.to(adminRoom).emit('queue:updated', updatePayload)
      }

      // Broadcast to ALL connected sockets for real-time cross-dashboard sync
      io.emit('queue:updated', updatePayload)

      log('INFO', 'Queue update broadcasted', {
        queueId: data.queueId,
        updateType: data.updateType,
        emittedBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in queue:update', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('queue:update', 'INTERNAL_ERROR', 'Failed to update queue'))
    }
  })

  /**
   * queue:position_changed - Notify specific users about position changes
   */
  socket.on('queue:position_changed', (data: PositionChangeData) => {
    try {
      if (!data.queueId || !data.tokenId) {
        socket.emit('error', createErrorResponse('queue:position_changed', 'MISSING_FIELDS', 'queueId and tokenId are required'))
        return
      }

      // Only admins and counter staff can trigger position changes
      if (!isStaff(role)) {
        socket.emit('error', createErrorResponse('queue:position_changed', 'FORBIDDEN', 'Only admins and counter staff can update positions'))
        return
      }

      const payload: PositionChangeData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      // Emit to the specific user's socket(s) and the queue room
      const queueRoom = getQueueRoom(data.queueId)
      io.to(queueRoom).emit('queue:position_changed', payload)

      log('INFO', 'Position change broadcasted', {
        queueId: data.queueId,
        tokenId: data.tokenId,
        from: data.previousPosition,
        to: data.currentPosition,
        emittedBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in queue:position_changed', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('queue:position_changed', 'INTERNAL_ERROR', 'Failed to update position'))
    }
  })

  /**
   * queue:closed - Notify all members that a queue has been closed
   */
  socket.on('queue:closed', (data: QueueClosedData) => {
    try {
      if (!data.queueId) {
        socket.emit('error', createErrorResponse('queue:closed', 'MISSING_QUEUE_ID', 'Queue ID is required'))
        return
      }

      // Only admins can close queues
      if (!isAdmin(role)) {
        socket.emit('error', createErrorResponse('queue:closed', 'FORBIDDEN', 'Only admins can close queues'))
        return
      }

      const payload: QueueClosedData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const queueRoom = getQueueRoom(data.queueId)
      io.to(queueRoom).emit('queue:closed', payload)

      // Also notify organization room
      if (data.organizationId) {
        const orgRoom = getOrgRoom(data.organizationId)
        io.to(orgRoom).emit('queue:closed', payload)

        const adminRoom = getAdminRoom(data.organizationId)
        io.to(adminRoom).emit('queue:closed', payload)
      }

      // Clean up room membership tracking
      queueRoomMembers.delete(data.queueId)

      log('INFO', 'Queue closed notification sent', {
        queueId: data.queueId,
        reason: data.reason,
        closedBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in queue:closed', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('queue:closed', 'INTERNAL_ERROR', 'Failed to close queue'))
    }
  })

  // ========================================================================
  // Token Events
  // ========================================================================

  /**
   * token:created - Notify when a new token is generated
   * Broadcasts to queue room AND all admin rooms so admin dashboards update in real-time
   */
  socket.on('token:created', (data: TokenCreatedData) => {
    try {
      if (!data.queueId || !data.tokenId || !data.tokenNumber) {
        socket.emit('error', createErrorResponse('token:created', 'MISSING_FIELDS', 'queueId, tokenId, and tokenNumber are required'))
        return
      }

      const payload: TokenCreatedData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const queueRoom = getQueueRoom(data.queueId)
      io.to(queueRoom).emit('token:created', payload)

      // Broadcast to ALL connected sockets so admin dashboards receive the update
      // regardless of which rooms they've joined
      io.emit('token:created', payload)

      log('INFO', 'Token created notification sent', {
        queueId: data.queueId,
        tokenId: data.tokenId,
        tokenNumber: data.tokenNumber,
        position: data.position
      })
    } catch (error) {
      log('ERROR', 'Error in token:created', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('token:created', 'INTERNAL_ERROR', 'Failed to notify token creation'))
    }
  })

  /**
   * token:called - Notify when a token is called to a counter
   * Broadcasts globally so user dashboards in other tabs/devices also receive the update
   */
  socket.on('token:called', (data: TokenCalledData) => {
    try {
      if (!data.queueId || !data.tokenId || !data.counterId) {
        socket.emit('error', createErrorResponse('token:called', 'MISSING_FIELDS', 'queueId, tokenId, and counterId are required'))
        return
      }

      // Only admins and counter staff can call tokens
      if (!isStaff(role)) {
        socket.emit('error', createErrorResponse('token:called', 'FORBIDDEN', 'Only admins and counter staff can call tokens'))
        return
      }

      const payload: TokenCalledData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const queueRoom = getQueueRoom(data.queueId)
      io.to(queueRoom).emit('token:called', payload)

      // Broadcast to ALL connected sockets so user dashboards update in real-time
      io.emit('token:called', payload)

      log('INFO', 'Token called notification sent', {
        queueId: data.queueId,
        tokenId: data.tokenId,
        tokenNumber: data.tokenNumber,
        counterName: data.counterName,
        calledBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in token:called', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('token:called', 'INTERNAL_ERROR', 'Failed to call token'))
    }
  })

  /**
   * token:serving - Notify when a token is being served
   * Broadcasts globally for real-time sync across all dashboards
   */
  socket.on('token:serving', (data: TokenServingData) => {
    try {
      if (!data.queueId || !data.tokenId || !data.counterId) {
        socket.emit('error', createErrorResponse('token:serving', 'MISSING_FIELDS', 'queueId, tokenId, and counterId are required'))
        return
      }

      // Only admins and counter staff can mark tokens as serving
      if (!isStaff(role)) {
        socket.emit('error', createErrorResponse('token:serving', 'FORBIDDEN', 'Only admins and counter staff can mark tokens as serving'))
        return
      }

      const payload: TokenServingData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const queueRoom = getQueueRoom(data.queueId)
      io.to(queueRoom).emit('token:serving', payload)

      // Broadcast to ALL connected sockets
      io.emit('token:serving', payload)

      log('INFO', 'Token serving notification sent', {
        queueId: data.queueId,
        tokenId: data.tokenId,
        tokenNumber: data.tokenNumber,
        counterName: data.counterName,
        servedBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in token:serving', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('token:serving', 'INTERNAL_ERROR', 'Failed to update token serving status'))
    }
  })

  /**
   * token:completed - Notify when a token service is completed
   * Broadcasts globally for real-time sync across all dashboards
   */
  socket.on('token:completed', (data: TokenCompletedData) => {
    try {
      if (!data.queueId || !data.tokenId || !data.counterId) {
        socket.emit('error', createErrorResponse('token:completed', 'MISSING_FIELDS', 'queueId, tokenId, and counterId are required'))
        return
      }

      // Only admins and counter staff can complete tokens
      if (!isStaff(role)) {
        socket.emit('error', createErrorResponse('token:completed', 'FORBIDDEN', 'Only admins and counter staff can complete tokens'))
        return
      }

      const payload: TokenCompletedData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const queueRoom = getQueueRoom(data.queueId)
      io.to(queueRoom).emit('token:completed', payload)

      // Broadcast to ALL connected sockets
      io.emit('token:completed', payload)

      log('INFO', 'Token completed notification sent', {
        queueId: data.queueId,
        tokenId: data.tokenId,
        tokenNumber: data.tokenNumber,
        counterName: data.counterName,
        completedBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in token:completed', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('token:completed', 'INTERNAL_ERROR', 'Failed to complete token'))
    }
  })

  /**
   * token:expired - Notify when a token has expired
   * Broadcasts globally for real-time sync across all dashboards
   */
  socket.on('token:expired', (data: TokenExpiredData) => {
    try {
      if (!data.queueId || !data.tokenId || !data.reason) {
        socket.emit('error', createErrorResponse('token:expired', 'MISSING_FIELDS', 'queueId, tokenId, and reason are required'))
        return
      }

      const payload: TokenExpiredData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const queueRoom = getQueueRoom(data.queueId)
      io.to(queueRoom).emit('token:expired', payload)

      // Broadcast to ALL connected sockets
      io.emit('token:expired', payload)

      log('INFO', 'Token expired notification sent', {
        queueId: data.queueId,
        tokenId: data.tokenId,
        tokenNumber: data.tokenNumber,
        reason: data.reason
      })
    } catch (error) {
      log('ERROR', 'Error in token:expired', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('token:expired', 'INTERNAL_ERROR', 'Failed to notify token expiration'))
    }
  })

  // ========================================================================
  // Admin Events
  // ========================================================================

  /**
   * admin:dashboard - Admin dashboard real-time updates
   */
  socket.on('admin:dashboard', (data: AdminDashboardData) => {
    try {
      if (!data.organizationId) {
        socket.emit('error', createErrorResponse('admin:dashboard', 'MISSING_ORG_ID', 'Organization ID is required'))
        return
      }

      // Only admins can receive/send dashboard updates
      if (!isAdmin(role)) {
        socket.emit('error', createErrorResponse('admin:dashboard', 'FORBIDDEN', 'Only admins can access dashboard updates'))
        return
      }

      const payload: AdminDashboardData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const adminRoom = getAdminRoom(data.organizationId)
      io.to(adminRoom).emit('admin:dashboard', payload)

      log('INFO', 'Admin dashboard update sent', {
        organizationId: data.organizationId,
        activeQueues: data.activeQueues,
        totalTokensToday: data.totalTokensToday,
        emittedBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in admin:dashboard', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('admin:dashboard', 'INTERNAL_ERROR', 'Failed to send dashboard update'))
    }
  })

  /**
   * admin:stats - Real-time stats for admin
   */
  socket.on('admin:stats', (data: AdminStatsData) => {
    try {
      if (!data.organizationId || !data.period) {
        socket.emit('error', createErrorResponse('admin:stats', 'MISSING_FIELDS', 'organizationId and period are required'))
        return
      }

      // Only admins can access stats
      if (!isAdmin(role)) {
        socket.emit('error', createErrorResponse('admin:stats', 'FORBIDDEN', 'Only admins can access stats'))
        return
      }

      const payload: AdminStatsData = {
        ...data,
        timestamp: data.timestamp || getTimestamp()
      }

      const adminRoom = getAdminRoom(data.organizationId)
      io.to(adminRoom).emit('admin:stats', payload)

      log('INFO', 'Admin stats update sent', {
        organizationId: data.organizationId,
        period: data.period,
        emittedBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in admin:stats', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('admin:stats', 'INTERNAL_ERROR', 'Failed to send stats update'))
    }
  })

  // ========================================================================
  // Utility Events
  // ========================================================================

  /**
   * ping - Simple ping/pong for latency measurement
   */
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: getTimestamp() })
  })

  /**
   * rooms:get - Get rooms the user is currently in
   */
  socket.on('rooms:get', () => {
    const rooms = Array.from(connectedUser.rooms)
    socket.emit('rooms:list', { rooms, timestamp: getTimestamp() })
  })

  /**
   * counters:register - Register a counter to an organization
   */
  socket.on('counters:register', (data: { organizationId: string; counterId: string }) => {
    try {
      if (!data.organizationId || !data.counterId) {
        socket.emit('error', createErrorResponse('counters:register', 'MISSING_FIELDS', 'organizationId and counterId are required'))
        return
      }

      if (!isStaff(role)) {
        socket.emit('error', createErrorResponse('counters:register', 'FORBIDDEN', 'Only admins and counter staff can register counters'))
        return
      }

      if (!organizationCounters.has(data.organizationId)) {
        organizationCounters.set(data.organizationId, new Set())
      }
      organizationCounters.get(data.organizationId)!.add(data.counterId)

      const orgRoom = getOrgRoom(data.organizationId)
      socket.join(orgRoom)
      connectedUser.rooms.add(orgRoom)

      socket.emit('counters:registered', {
        counterId: data.counterId,
        organizationId: data.organizationId,
        timestamp: getTimestamp()
      })

      log('INFO', 'Counter registered', {
        counterId: data.counterId,
        organizationId: data.organizationId,
        registeredBy: userId
      })
    } catch (error) {
      log('ERROR', 'Error in counters:register', { error: String(error), socketId: socket.id })
      socket.emit('error', createErrorResponse('counters:register', 'INTERNAL_ERROR', 'Failed to register counter'))
    }
  })

  // ========================================================================
  // Disconnect Handler
  // ========================================================================

  socket.on('disconnect', (reason) => {
    const user = connectedUsers.get(socket.id)

    if (user) {
      // Clean up room membership tracking
      for (const room of user.rooms) {
        // Extract queueId from room name like "queue:abc123"
        if (room.startsWith(`${QUEUE_ROOM_PREFIX}:`)) {
          const queueId = room.replace(`${QUEUE_ROOM_PREFIX}:`, '')
          const members = queueRoomMembers.get(queueId)
          if (members) {
            members.delete(socket.id)
            if (members.size === 0) {
              queueRoomMembers.delete(queueId)
            }

            // Notify remaining members about the departure
            const memberCount = members.size
            io.to(room).emit('queue:member_left', {
              queueId,
              userId: user.userId,
              memberCount,
              timestamp: getTimestamp()
            })
          }
        }
      }

      // Remove from connected users
      connectedUsers.delete(socket.id)

      log('INFO', 'User disconnected', {
        socketId: socket.id,
        userId: user.userId,
        name: user.name,
        role: user.role,
        reason,
        totalOnline: getOnlineUserCount()
      })
    } else {
      log('WARN', 'Unknown socket disconnected', { socketId: socket.id, reason })
    }
  })

  // ========================================================================
  // Error Handler
  // ========================================================================

  socket.on('error', (error) => {
    log('ERROR', 'Socket error', { socketId: socket.id, error: String(error) })
  })
})

// ============================================================================
// Periodic Health Logging
// ============================================================================

setInterval(() => {
  log('INFO', 'Health check', {
    onlineUsers: getOnlineUserCount(),
    activeQueues: queueRoomMembers.size,
    uptime: `${Math.floor(process.uptime())}s`
  })
}, 60000) // Every 60 seconds

// ============================================================================
// Start Server
// ============================================================================

httpServer.listen(PORT, () => {
  log('INFO', `Queue Seva Socket.io service started`, {
    port: PORT,
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV || 'development'
  })
})

// ============================================================================
// Graceful Shutdown
// ============================================================================

function gracefulShutdown(signal: string) {
  log('INFO', `Received ${signal}, shutting down gracefully...`)

  // Notify all connected clients
  io.emit('server:shutdown', {
    message: 'Server is shutting down',
    timestamp: getTimestamp()
  })

  // Give clients time to receive the shutdown notification
  setTimeout(() => {
    io.disconnectSockets(true)
    httpServer.close(() => {
      log('INFO', 'Socket.io server closed')
      process.exit(0)
    })
  }, 2000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught exception', { error: String(error), stack: error.stack })
})

process.on('unhandledRejection', (reason) => {
  log('ERROR', 'Unhandled rejection', { reason: String(reason) })
})
