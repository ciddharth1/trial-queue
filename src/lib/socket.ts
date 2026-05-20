'use client'

import { io, Socket } from 'socket.io-client'

// ============================================================================
// Socket.io Client for Queue Seva Real-Time Updates
// ============================================================================

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3003'

type EventHandler = (...args: any[]) => void

class SocketManager {
  private socket: Socket | null = null
  private token: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private listeners: Map<string, Set<EventHandler>> = new Map()
  private isConnected = false

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

    this.socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      this.isConnected = true
      this.reconnectAttempts = 0
      console.log('[Socket] Connected:', this.socket?.id)
      this.emitToListeners('socket:connected', { socketId: this.socket?.id })
    })

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false
      console.log('[Socket] Disconnected:', reason)
      this.emitToListeners('socket:disconnected', { reason })
    })

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++
      console.warn('[Socket] Connection error:', error.message)
      this.emitToListeners('socket:error', { error: error.message })
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
   */
  emitTokenCreated(data: {
    queueId: string
    tokenId: string
    tokenNumber: string
    userId: string
    position: number
    estimatedWaitMinutes?: number
  }) {
    if (!this.socket?.connected) return
    this.socket.emit('token:created', {
      ...data,
      timestamp: new Date().toISOString(),
    })
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
    if (!this.socket?.connected) return
    this.socket.emit('token:called', {
      ...data,
      timestamp: new Date().toISOString(),
    })
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
    if (!this.socket?.connected) return
    this.socket.emit('token:serving', {
      ...data,
      timestamp: new Date().toISOString(),
    })
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
    if (!this.socket?.connected) return
    this.socket.emit('token:completed', {
      ...data,
      timestamp: new Date().toISOString(),
    })
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
    if (!this.socket?.connected) return
    this.socket.emit('token:expired', {
      ...data,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Broadcast a queue update
   */
  emitQueueUpdate(data: {
    queueId: string
    organizationId: string
    updateType: 'QUEUE_UPDATED' | 'QUEUE_PAUSED' | 'QUEUE_RESUMED' | 'QUEUE_CLOSED'
  }) {
    if (!this.socket?.connected) return
    this.socket.emit('queue:update', {
      ...data,
      data: {},
      timestamp: new Date().toISOString(),
    })
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
