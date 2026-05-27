'use client'

import { io, Socket } from 'socket.io-client'

// ============================================================================
// Socket.io Client for Queue Seva Real-Time Updates
// ============================================================================

// Determine socket URL for real-time connections
// In production, the reverse proxy (Caddy/Nginx) routes /socket.io/ to the socket service
// So we use the same origin. Only set NEXT_PUBLIC_SOCKET_URL if the socket service
// is on a completely different domain.
function getSocketUrl(): string {
  if (typeof window !== 'undefined') {
    const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL
    if (envUrl) {
      return envUrl
    }
    // Use the current origin — reverse proxy handles /socket.io/ routing
    return window.location.origin
  }
  // SSR: return empty string (socket connections only happen client-side)
  return ''
}

const SOCKET_URL = getSocketUrl()

type EventHandler = (...args: any[]) => void

class SocketManager {
  private socket: Socket | null = null
  private token: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private listeners: Map<string, Set<EventHandler>> = new Map()
  private isConnected = false
  private pendingEmitQueue: { event: string; data: any }[] = []

  /**
   * Connect to the Socket.io server with a JWT token
   */
  connect(accessToken: string) {
    if (this.socket?.connected && this.token === accessToken) {
      return // Already connected with the same token
    }

    // Disconnect existing connection if token changed
    if (this.socket && this.token !== accessToken) {
      this.disconnect()
    }

    this.token = accessToken

    // Connect using same origin — reverse proxy routes /socket.io/ to socket service
    // Socket.io default path is /socket.io/ which matches the server config
    this.socket = io(SOCKET_URL, {
      path: '/socket.io/',
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000,
      upgrade: true,
      rememberUpgrade: true,
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      this.isConnected = true
      this.reconnectAttempts = 0
      console.log('[Socket] Connected:', this.socket?.id, 'URL:', SOCKET_URL)
      this.emitToListeners('socket:connected', { socketId: this.socket?.id })

      // Flush any pending emit queue
      while (this.pendingEmitQueue.length > 0) {
        const pending = this.pendingEmitQueue.shift()!
        if (this.socket?.connected) {
          this.socket.emit(pending.event, pending.data)
        }
      }
    })

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false
      console.log('[Socket] Disconnected:', reason)
      this.emitToListeners('socket:disconnected', { reason })
    })

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++
      // Only log every 5th attempt to reduce noise
      if (this.reconnectAttempts <= 3 || this.reconnectAttempts % 5 === 0) {
        console.warn('[Socket] Connection error (attempt ' + this.reconnectAttempts + '):', error.message)
      }
      this.emitToListeners('socket:error', { error: error.message })
    })

    // Handle connection acknowledgment from server
    this.socket.on('connection:ack', (data) => {
      console.log('[Socket] Server acknowledgment:', data)
    })

    // Queue events
    this.socket.on('queue:joined', (data) => this.emitToListeners('queue:joined', data))
    this.socket.on('queue:member_joined', (data) => this.emitToListeners('queue:member_joined', data))
    this.socket.on('queue:left', (data) => this.emitToListeners('queue:left', data))
    this.socket.on('queue:member_left', (data) => this.emitToListeners('queue:member_left', data))
    this.socket.on('queue:updated', (data) => this.emitToListeners('queue:updated', data))
    this.socket.on('queue:position_changed', (data) => this.emitToListeners('queue:position_changed', data))
    this.socket.on('queue:closed', (data) => this.emitToListeners('queue:closed', data))

    // Token events
    this.socket.on('token:created', (data) => this.emitToListeners('token:created', data))
    this.socket.on('token:called', (data) => this.emitToListeners('token:called', data))
    this.socket.on('token:serving', (data) => this.emitToListeners('token:serving', data))
    this.socket.on('token:completed', (data) => this.emitToListeners('token:completed', data))
    this.socket.on('token:expired', (data) => this.emitToListeners('token:expired', data))

    // Admin events
    this.socket.on('admin:dashboard', (data) => this.emitToListeners('admin:dashboard', data))
    this.socket.on('admin:stats', (data) => this.emitToListeners('admin:stats', data))

    // Server events
    this.socket.on('server:shutdown', (data) => this.emitToListeners('server:shutdown', data))

    // Error events
    this.socket.on('error', (data) => this.emitToListeners('socket:error', data))
  }

  /**
   * Disconnect from the Socket.io server
   */
  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
      this.isConnected = false
      this.token = null
      this.pendingEmitQueue = []
    }
  }

  /**
   * Join a queue room to receive updates for that queue
   */
  joinQueueRoom(queueId: string, organizationId?: string) {
    if (!this.socket?.connected) return
    this.socket.emit('queue:join', { queueId, organizationId })
  }

  /**
   * Leave a queue room
   */
  leaveQueueRoom(queueId: string) {
    if (!this.socket?.connected) return
    this.socket.emit('queue:leave', { queueId })
  }

  /**
   * Notify that a token was created (called after joining a queue)
   * Uses queueing to ensure the event is sent even if socket is temporarily disconnected
   */
  emitTokenCreated(data: {
    queueId: string
    tokenId: string
    tokenNumber: string
    userId: string
    position: number
    estimatedWaitMinutes?: number
  }) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    }
    if (this.socket?.connected) {
      this.socket.emit('token:created', payload)
    } else {
      // Queue the event to be sent on reconnection
      this.pendingEmitQueue.push({ event: 'token:created', data: payload })
    }
  }

  /**
   * Notify that a token was called (admin action)
   */
  emitTokenCalled(data: {
    queueId: string
    tokenId: string
    tokenNumber: string
    counterId: string
    counterName: string
    userId?: string
  }) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    }
    if (this.socket?.connected) {
      this.socket.emit('token:called', payload)
    } else {
      this.pendingEmitQueue.push({ event: 'token:called', data: payload })
    }
  }

  /**
   * Notify that a token is being served
   */
  emitTokenServing(data: {
    queueId: string
    tokenId: string
    tokenNumber: string
    counterId: string
    counterName: string
    userId?: string
  }) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    }
    if (this.socket?.connected) {
      this.socket.emit('token:serving', payload)
    } else {
      this.pendingEmitQueue.push({ event: 'token:serving', data: payload })
    }
  }

  /**
   * Notify that a token was completed
   */
  emitTokenCompleted(data: {
    queueId: string
    tokenId: string
    tokenNumber: string
    counterId: string
    counterName: string
    userId?: string
  }) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    }
    if (this.socket?.connected) {
      this.socket.emit('token:completed', payload)
    } else {
      this.pendingEmitQueue.push({ event: 'token:completed', data: payload })
    }
  }

  /**
   * Notify that a token expired
   */
  emitTokenExpired(data: {
    queueId: string
    tokenId: string
    tokenNumber: string
    reason: 'TIMEOUT' | 'NO_SHOW' | 'CANCELLED'
  }) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
    }
    if (this.socket?.connected) {
      this.socket.emit('token:expired', payload)
    } else {
      this.pendingEmitQueue.push({ event: 'token:expired', data: payload })
    }
  }

  /**
   * Broadcast a queue update
   */
  emitQueueUpdate(data: {
    queueId: string
    organizationId: string
    updateType: 'QUEUE_UPDATED' | 'QUEUE_PAUSED' | 'QUEUE_RESUMED' | 'QUEUE_CLOSED'
  }) {
    const payload = {
      ...data,
      data: {},
      timestamp: new Date().toISOString(),
    }
    if (this.socket?.connected) {
      this.socket.emit('queue:update', payload)
    } else {
      this.pendingEmitQueue.push({ event: 'queue:update', data: payload })
    }
  }

  /**
   * Register a counter
   */
  registerCounter(organizationId: string, counterId: string) {
    if (!this.socket?.connected) return
    this.socket.emit('counters:register', { organizationId, counterId })
  }

  /**
   * Subscribe to a specific event
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler)
    }
  }

  /**
   * Unsubscribe from a specific event
   */
  off(event: string, handler?: EventHandler) {
    if (handler) {
      this.listeners.get(event)?.delete(handler)
    } else {
      this.listeners.delete(event)
    }
  }

  /**
   * Emit to local listeners
   */
  private emitToListeners(event: string, data: any) {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data)
        } catch (error) {
          console.error(`[Socket] Error in handler for ${event}:`, error)
        }
      })
    }
  }

  /**
   * Check if connected
   */
  connected(): boolean {
    return this.isConnected && this.socket?.connected === true
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | undefined {
    return this.socket?.id
  }
}

// Singleton instance
export const socketManager = new SocketManager()
