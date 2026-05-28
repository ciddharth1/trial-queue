'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { socketManager } from '@/lib/socket'

// ─── CROSS-TAB REAL-TIME SYNC ───────────────────────
// Uses BroadcastChannel API for same-browser cross-tab communication,
// Socket.io for cross-browser/device real-time communication,
// and periodic polling as a fallback.

type RefreshEventType = 'queue-update' | 'token-update' | 'notification-update' | 'admin-update' | 'all'

// In-memory listeners for same-tab communication
const listeners: Map<string, Set<(type: RefreshEventType) => void>> = new Map()

// BroadcastChannel for cross-tab communication
let broadcastChannel: BroadcastChannel | null = null

// Unique tab identifier
let tabId: string | null = null
function getTabId(): string {
  if (!tabId) {
    tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('queue-seva-tab-id', tabId)
    }
  }
  return tabId
}

// Initialize BroadcastChannel and tab ID (only in browser)
if (typeof window !== 'undefined') {
  // Initialize tab ID from session storage
  tabId = sessionStorage.getItem('queue-seva-tab-id') || null

  if ('BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel('queue-seva-sync')

      broadcastChannel.onmessage = (event) => {
        const { type, source } = event.data as { type: RefreshEventType; source: string }
        // Don't process our own messages
        if (source === getTabId()) return

        // Trigger in-memory listeners
        const handlers = listeners.get('global') || new Set()
        handlers.forEach((handler) => handler(type))

        // Also emit to 'all-listeners'
        if (type !== 'all') {
          const allHandlers = listeners.get('all-listeners') || new Set()
          allHandlers.forEach((handler) => handler(type))
        }

        // Update the Zustand refresh counter (synchronous via direct import)
        try {
          useAppStore.getState().triggerRefresh()
          useAppStore.getState().setSocketConnected(true)
        } catch {
          // Store might not be ready yet
        }
      }
    } catch (error) {
      console.warn('BroadcastChannel not available:', error)
    }
  }
}

// ─── SOCKET.IO INTEGRATION ───────────────────────────
// Listen for Socket.io events and trigger refreshes

let socketInitialized = false

function triggerStoreRefresh() {
  try {
    useAppStore.getState().triggerRefresh()
  } catch {
    // Store might not be ready yet
  }
}

function initializeSocketListeners() {
  if (socketInitialized) return
  socketInitialized = true

  // When any queue/token event comes via Socket.io, trigger a refresh
  const socketEvents: string[] = [
    'queue:member_joined',
    'queue:member_left',
    'queue:updated',
    'queue:position_changed',
    'queue:closed',
    'token:created',
    'token:called',
    'token:serving',
    'token:completed',
    'token:expired',
    'admin:dashboard',
    'admin:stats',
  ]

  socketEvents.forEach((event) => {
    socketManager.on(event, (data: any) => {
      // Map socket events to refresh types
      let refreshType: RefreshEventType = 'all'
      if (event.startsWith('token:')) refreshType = 'token-update'
      else if (event.startsWith('queue:')) refreshType = 'queue-update'
      else if (event.startsWith('admin:')) refreshType = 'admin-update'

      // Trigger local in-memory listeners
      const handlers = listeners.get('global') || new Set()
      handlers.forEach((handler) => handler(refreshType))

      // Also trigger 'all' listeners
      const allHandlers = listeners.get('all-listeners') || new Set()
      allHandlers.forEach((handler) => handler(refreshType))

      // Update Zustand refresh counter
      triggerStoreRefresh()
    })
  })

  // Socket connection status
  socketManager.on('socket:connected', () => {
    try {
      useAppStore.getState().setSocketConnected(true)
    } catch {}
  })

  socketManager.on('socket:disconnected', () => {
    try {
      useAppStore.getState().setSocketConnected(false)
    } catch {}
  })
}

// ─── EMIT REFRESH ────────────────────────────────────
// Call this when data changes to notify all tabs and in-memory listeners

export function emitRefresh(type: RefreshEventType) {
  // 1. Notify in-memory listeners (same tab)
  const handlers = listeners.get('global') || new Set()
  handlers.forEach((handler) => handler(type))

  // Also emit 'all' for any type
  if (type !== 'all') {
    const allHandlers = listeners.get('all-listeners') || new Set()
    allHandlers.forEach((handler) => handler(type))
  }

  // 2. Broadcast to other tabs via BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        type,
        source: getTabId(),
        timestamp: Date.now(),
      })
    } catch (error) {
      console.warn('Failed to broadcast refresh:', error)
    }
  }

  // 3. Update Zustand refresh counter for same-tab reactivity
  triggerStoreRefresh()
}

function subscribe(handler: (type: RefreshEventType) => void): () => void {
  if (!listeners.has('global')) listeners.set('global', new Set())
  listeners.get('global')!.add(handler)
  return () => {
    listeners.get('global')?.delete(handler)
  }
}

// ─── AUTO-REFRESH HOOK ───────────────────────────────
// Polls data at a specified interval and refreshes on events

interface UseAutoRefreshOptions {
  interval?: number // polling interval in ms (default: 5000 = 5s)
  enabled?: boolean
  onRefresh?: () => Promise<void>
  refreshOnEvents?: RefreshEventType[]
}

export function useAutoRefresh({
  interval = 30_000,   // Fallback poll — only fires when socket is disconnected
  enabled = true,
  onRefresh,
  refreshOnEvents = ['queue-update', 'token-update', 'admin-update', 'all'],
}: UseAutoRefreshOptions) {
  const refreshRef = useRef(onRefresh)
  const autoRefreshSetting = useAppStore((s) => s.settings.autoRefresh)
  const socketConnected = useAppStore((s) => s.socketConnected)

  useEffect(() => {
    refreshRef.current = onRefresh
  }, [onRefresh])

  // ─── Fallback polling ─────────────────────────────────────────────────────
  // Only poll when the socket is disconnected (network hiccup, server restart,
  // etc.). When the socket is live, all updates arrive via events below and
  // polling is redundant — it causes the flicker the user reported.
  useEffect(() => {
    if (!enabled || !refreshRef.current) return
    if (!autoRefreshSetting) return
    if (socketConnected) return  // socket is live — no need to poll

    const id = setInterval(() => {
      refreshRef.current?.()
    }, interval)

    return () => clearInterval(id)
  }, [interval, enabled, autoRefreshSetting, socketConnected])

  // ─── Event-driven refresh ─────────────────────────────────────────────────
  // Socket.io events → triggerRefresh() → refreshCounter++ → components
  // re-fetch only the data they care about. No timer, no flicker.
  useEffect(() => {
    if (!enabled || !refreshRef.current) return

    const unsubscribe = subscribe((type) => {
      if (refreshOnEvents.includes(type) || type === 'all') {
        refreshRef.current?.()
      }
    })

    return unsubscribe
  }, [enabled])
}

// ─── SOCKET.IO CONNECTION HOOK ──────────────────────
// Manages the Socket.io connection lifecycle

export function useSocketConnection() {
  const { accessToken, isAuthenticated } = useAppStore()

  useEffect(() => {
    // Initialize socket listeners once
    initializeSocketListeners()

    if (isAuthenticated && accessToken) {
      // Connect to Socket.io server with JWT token
      socketManager.connect(accessToken)
    } else {
      // Disconnect when logged out
      socketManager.disconnect()
    }

    return () => {
      // Don't disconnect on unmount - keep connection alive across views
    }
  }, [isAuthenticated, accessToken])
}

// ─── QUEUE ROOM HOOK ─────────────────────────────────
// Join/leave queue rooms when viewing a specific queue

export function useQueueRoom(queueId: string | null | undefined) {
  const { isAuthenticated } = useAppStore()

  useEffect(() => {
    if (!isAuthenticated || !queueId) return

    // Join the queue room to receive real-time updates
    socketManager.joinQueueRoom(queueId)

    return () => {
      // Leave the queue room when navigating away
      socketManager.leaveQueueRoom(queueId)
    }
  }, [queueId, isAuthenticated])
}

// ─── QUEUE DATA REFRESH HOOK ─────────────────────────
// Keeps queue data in sync across user and admin panels

export function useQueueSync() {
  const { setQueues, user, setUserTokens } = useAppStore()

  const refreshQueues = useCallback(async () => {
    try {
      const result = await apiClient.getQueues()
      if (result.success && result.data) {
        const items = (result.data as any).items || result.data
        if (Array.isArray(items)) {
          setQueues(items)
        }
      }
    } catch (error) {
      console.error('Failed to refresh queues:', error)
    }
  }, [setQueues])

  const refreshUserTokens = useCallback(async () => {
    if (!user) return
    try {
      const result = await apiClient.getTokens({ userId: user.id })
      if (result.success && result.data) {
        const items = (result.data as any).items || result.data
        if (Array.isArray(items)) {
          setUserTokens(items)
        }
      }
    } catch (error) {
      console.error('Failed to refresh user tokens:', error)
    }
  }, [user, setUserTokens])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshQueues(), refreshUserTokens()])
  }, [refreshQueues, refreshUserTokens])

  return { refreshQueues, refreshUserTokens, refreshAll }
}

// ─── ADMIN STATS REFRESH HOOK ────────────────────────

export function useAdminSync() {
  const refreshAdminStats = useCallback(async () => {
    emitRefresh('admin-update')
  }, [])

  return { refreshAdminStats }
}

// ─── CLEANUP ─────────────────────────────────────────

// Close BroadcastChannel on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (broadcastChannel) {
      broadcastChannel.close()
    }
    socketManager.disconnect()
  })
}
