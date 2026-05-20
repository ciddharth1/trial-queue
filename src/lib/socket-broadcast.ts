// ============================================================================
// Server-Side Socket.io Broadcast Helper
// ============================================================================
// This module allows Next.js API routes to trigger Socket.io events
// by making HTTP requests to the socket service's /broadcast endpoint.
// This ensures real-time updates are sent even if the client's socket
// connection is not established yet.

const SOCKET_SERVICE_URL = process.env.SOCKET_SERVICE_URL || 'http://localhost:3003'

interface BroadcastPayload {
  event: string
  data: Record<string, unknown>
}

/**
 * Broadcast a Socket.io event from the server side.
 * This is fire-and-forget — errors are logged but don't block API responses.
 */
async function broadcast(event: string, data: Record<string, unknown>): Promise<void> {
  try {
    const payload: BroadcastPayload = {
      event,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
        source: 'server',
      },
    }

    const response = await fetch(`${SOCKET_SERVICE_URL}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000), // 3s timeout — don't block API response
    })

    if (!response.ok) {
      console.warn(`[SocketBroadcast] Failed to broadcast ${event}: HTTP ${response.status}`)
    }
  } catch (error) {
    // Don't throw — socket broadcast is non-critical
    console.warn(`[SocketBroadcast] Failed to broadcast ${event}:`, (error as Error).message)
  }
}

// ─── Queue Events ──────────────────────────────────────────

export function broadcastQueueUpdate(queueId: string, updateType: string, organizationId?: string) {
  return broadcast('queue:updated', {
    queueId,
    updateType,
    organizationId: organizationId || 'default',
  })
}

export function broadcastQueueJoined(queueId: string, userId: string, memberCount?: number) {
  return broadcast('queue:member_joined', {
    queueId,
    userId,
    memberCount: memberCount || 0,
  })
}

export function broadcastQueueLeft(queueId: string, userId: string, memberCount?: number) {
  return broadcast('queue:member_left', {
    queueId,
    userId,
    memberCount: memberCount || 0,
  })
}

// ─── Token Events ──────────────────────────────────────────

export function broadcastTokenCreated(data: {
  queueId: string
  tokenId: string
  tokenNumber: string
  userId: string
  position: number
  estimatedWaitMinutes?: number
}) {
  return broadcast('token:created', data)
}

export function broadcastTokenCalled(data: {
  queueId: string
  tokenId: string
  tokenNumber: string
  counterId: string
  counterName: string
  userId?: string
}) {
  return broadcast('token:called', data)
}

export function broadcastTokenServing(data: {
  queueId: string
  tokenId: string
  tokenNumber: string
  counterId: string
  counterName: string
  userId?: string
}) {
  return broadcast('token:serving', data)
}

export function broadcastTokenCompleted(data: {
  queueId: string
  tokenId: string
  tokenNumber: string
  counterId: string
  counterName: string
  userId?: string
}) {
  return broadcast('token:completed', data)
}

export function broadcastTokenExpired(data: {
  queueId: string
  tokenId: string
  tokenNumber: string
  reason: 'TIMEOUT' | 'NO_SHOW' | 'CANCELLED'
}) {
  return broadcast('token:expired', data)
}

// ─── Admin Events ──────────────────────────────────────────

export function broadcastAdminDashboardUpdate(organizationId: string, data: Record<string, unknown>) {
  return broadcast('admin:dashboard', {
    organizationId,
    ...data,
  })
}
