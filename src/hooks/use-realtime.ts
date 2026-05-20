'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'

// ─── CROSS-TAB REAL-TIME SYNC ───────────────────────
// Uses BroadcastChannel API for same-browser cross-tab communication
// and periodic polling for different-browser sessions.
// When a user joins/leaves a queue or admin makes changes,
// broadcast the event so ALL tabs (user + admin) refresh immediately.

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

        // Update the Zustand refresh counter (synchronous)
        try {
          const { useAppStore } = require('@/lib/store')
          const store = useAppStore.getState()
          store.triggerRefresh()
          store.setSocketConnected(true)
        } catch {
          // Store might not be ready yet
        }
      }
    } catch (error) {
      console.warn('BroadcastChannel not available:', error)
    }
  }
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
  try {
    const { useAppStore } = require('@/lib/store')
    useAppStore.getState().triggerRefresh()
  } catch {
    // Store might not be ready yet
  }
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
  interval = 5000,
  enabled = true,
  onRefresh,
  refreshOnEvents = ['queue-update', 'token-update', 'admin-update', 'all'],
}: UseAutoRefreshOptions) {
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh

  // Polling - reduced interval for more responsive updates
  useEffect(() => {
    if (!enabled || !refreshRef.current) return

    const id = setInterval(() => {
      refreshRef.current?.()
    }, interval)

    return () => clearInterval(id)
  }, [interval, enabled])

  // Event-based refresh (in-memory + BroadcastChannel)
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
  })
}
