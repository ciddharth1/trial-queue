'use client'

import type { AppUser, AppQueue, AppToken, AppNotification } from '@/lib/store'

const BASE_URL = '/api'

// ─── API CLIENT ─────────────────────────────────────────
class ApiClient {
  private accessToken: string | null = null

  setAccessToken(token: string | null) {
    this.accessToken = token
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ success: boolean; data?: T; error?: string; message?: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
      })

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          return { success: false, error: `Request failed with status ${response.status}` }
        }
        return { success: true }
      }

      const data = await response.json()

      // Handle HTTP errors
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired - try refresh (only if we haven't already tried)
          const store = (await import('@/lib/store')).useAppStore.getState()
          if (store.refreshToken && !(options as any)._isRetry) {
            try {
              const refreshResult = await this.refreshToken(store.refreshToken)
              if (refreshResult.success && refreshResult.data) {
                this.setAccessToken(refreshResult.data.accessToken)
                store.setAuth(store.user!, refreshResult.data.accessToken, store.refreshToken!)
                // Retry the original request with the new access token
                headers['Authorization'] = `Bearer ${refreshResult.data.accessToken}`
                const retryResponse = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, _isRetry: true } as any)
                if (retryResponse.ok) {
                  return retryResponse.json()
                }
              }
            } catch {
              // Refresh failed below — fall through to silent logout
            }
            // Refresh attempted but didn't succeed — clear auth so the next
            // navigation lands on the welcome screen instead of looping.
            store.logout()
          }
          // Avoid surfacing "Session expired" as a UI error during initial
          // hydration. Caller code already handles success/failure based on
          // result.success and we don't want a jarring banner on first load.
          return { success: false, error: 'Not authenticated' }
        }
        return { success: false, error: data.error || data.message || `Request failed (${response.status})` }
      }

      return data
    } catch (error) {
      console.error('API request failed:', error)
      return { success: false, error: 'Network error. Please check your connection and try again.' }
    }
  }

  // ─── AUTH ────────────────────────────────────────────
  async register(email: string, name: string, password: string, phone?: string) {
    return this.request<{ user: AppUser; accessToken: string; refreshToken: string }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, name, password, phone }),
      }
    )
  }

  async login(email: string, password: string) {
    return this.request<{ user: AppUser; accessToken: string; refreshToken: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    )
  }

  async loginWithGoogle(credential: string) {
    return this.request<{ user: AppUser; accessToken: string; refreshToken: string }>(
      '/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ credential }),
      }
    )
  }

  async getProfile() {
    return this.request<AppUser>('/auth/me')
  }

  async refreshToken(refreshToken: string) {
    return this.request<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    })
  }

  // ─── QUEUES ─────────────────────────────────────────
  async getQueues(params?: { status?: string; serviceCenterId?: string; page?: number }) {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.serviceCenterId) query.set('serviceCenterId', params.serviceCenterId)
    if (params?.page) query.set('page', String(params.page))
    const qs = query.toString()
    return this.request<{ items: AppQueue[]; total: number; page: number; pageSize: number }>(
      `/queue${qs ? `?${qs}` : ''}`
    )
  }

  async getQueue(id: string) {
    return this.request<AppQueue>(`/queue/${id}`)
  }

  async createQueue(data: {
    name: string
    description?: string
    prefix?: string
    maxCapacity?: number
    serviceCenterId: string
  }) {
    return this.request<AppQueue>('/queue', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateQueue(
    id: string,
    data: {
      name?: string
      description?: string
      status?: string
      maxCapacity?: number
    }
  ) {
    return this.request<AppQueue>(`/queue/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteQueue(id: string) {
    return this.request<void>(`/queue/${id}`, { method: 'DELETE' })
  }

  async joinQueue(queueId: string) {
    return this.request<AppToken>('/queue/join', {
      method: 'POST',
      body: JSON.stringify({ queueId }),
    })
  }

  async leaveQueue(queueId: string) {
    return this.request<void>('/queue/leave', {
      method: 'POST',
      body: JSON.stringify({ queueId }),
    })
  }

  // ─── TOKENS ─────────────────────────────────────────
  async getTokens(params?: { status?: string; queueId?: string; userId?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.queueId) query.set('queueId', params.queueId)
    if (params?.userId) query.set('userId', params.userId)
    if (params?.page) query.set('page', String(params.page))
    if (params?.pageSize) query.set('pageSize', String(params.pageSize))
    const qs = query.toString()
    return this.request<{ items: AppToken[]; total: number }>(`/token${qs ? `?${qs}` : ''}`)
  }

  async getToken(id: string) {
    return this.request<AppToken>(`/token/${id}`)
  }

  async updateToken(id: string, data: { status?: string; serviceCounterId?: string }) {
    return this.request<AppToken>(`/token/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  /**
   * Validate a single-use QR token. Used by admin scanners to consume the
   * token at a counter / turnstile. Always 200; check `data.valid`.
   */
  async validateQrToken(qrPayload: string, serviceCounterId?: string) {
    return this.request<{
      valid: boolean
      reason?: string
      tokenNumber?: string
      tokenId?: string
      consumedAt?: string
      counter?: { id: string; name: string; label?: string } | null
      user?: { id: string; name: string; email: string; avatar?: string | null } | null
      queue?: { id: string; name: string; prefix: string } | null
    }>('/token/validate', {
      method: 'POST',
      body: JSON.stringify({ qrPayload, serviceCounterId }),
    })
  }

  // ─── ADMIN ──────────────────────────────────────────
  async getAdminStats() {
    return this.request<{
      totalUsers: number
      activeQueues: number
      tokensServedToday: number
      avgWaitTime: number
      totalServiceCenters: number
      totalTokensToday: number
    }>('/admin')
  }

  async getAdminAnalytics(params?: { queueId?: string; days?: number }) {
    const query = new URLSearchParams()
    if (params?.queueId) query.set('queueId', params.queueId)
    if (params?.days) query.set('days', String(params.days))
    const qs = query.toString()
    return this.request<{
      summary: Record<string, unknown>
      dailyTraffic: unknown[]
      peakHours: unknown[]
    }>(`/admin/analytics${qs ? `?${qs}` : ''}`)
  }

  // ─── NOTIFICATIONS ──────────────────────────────────
  async getNotifications(params?: { unreadOnly?: boolean; page?: number }) {
    const query = new URLSearchParams()
    if (params?.unreadOnly) query.set('isRead', 'false')
    if (params?.page) query.set('page', String(params.page))
    const qs = query.toString()
    return this.request<{
      items: AppNotification[]
      unreadCount: number
      total: number
    }>(`/notification${qs ? `?${qs}` : ''}`)
  }

  async markNotificationsRead(notificationIds?: string[], markAll?: boolean) {
    return this.request<void>('/notification', {
      method: 'PATCH',
      body: JSON.stringify({ notificationIds, markAll }),
    })
  }

  // ─── SERVICE CENTERS ────────────────────────────────
  async getServiceCenters() {
    return this.request<{ items: { id: string; name: string; description?: string; address?: string }[] }>('/service-center')
  }

  async createServiceCenter(data: {
    name: string
    description?: string
    address?: string
    phone?: string
  }) {
    return this.request<{ id: string; name: string }>('/service-center', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }
}

export const apiClient = new ApiClient()
