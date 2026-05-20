'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'

// ─── GLOBAL REFRESH EVENT SYSTEM ─────────────────────
// When a user joins/leaves a queue or admin makes changes,
// emit a refresh event so all screens update

type RefreshEventType = 'queue-update' | 'token-update' | 'notification-update' | 'admin-update' | 'all'

const listeners: Map<string, Set<(type: RefreshEventType) => void>> = new Map()

export function emitRefresh(type: RefreshEventType) {
  const handlers = listeners.get('global') || new Set()
  handlers.forEach((handler) => handler(type))
  // Also emit 'all' for any type
  if (type !== 'all') {
    const allHandlers = listeners.get('all-listeners') || new Set()
    allHandlers.forEach((handler) => handler(type))
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
  interval?: number // polling interval in ms (default: 10000 = 10s)
  enabled?: boolean
  onRefresh?: () => Promise<void>
  refreshOnEvents?: RefreshEventType[]
}

export function useAutoRefresh({
  interval = 10000,
  enabled = true,
  onRefresh,
  refreshOnEvents = ['queue-update', 'token-update', 'admin-update', 'all'],
}: UseAutoRefreshOptions) {
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh

  // Polling
  useEffect(() => {
    if (!enabled || !refreshRef.current) return

    const id = setInterval(() => {
      refreshRef.current?.()
    }, interval)

    return () => clearInterval(id)
  }, [interval, enabled])

  // Event-based refresh
  useEffect(() => {
    if (!enabled || !refreshRef.current) return

    const unsubscribe = subscribe((type) => {
      if (refreshOnEvents.includes(type) || type === 'all') {
        refreshRef.current?.()
      }
    })

    return unsubscribe
  }, [enabled, refreshOnEvents.join(',')])
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
    // Stats will be refreshed by individual component state
    emitRefresh('admin-update')
  }, [])

  return { refreshAdminStats }
}
