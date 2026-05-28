'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── VIEW TYPES ──────────────────────────────────────────
export type AppView =
  | 'splash'
  | 'welcome'
  | 'login'
  | 'register'
  | 'dashboard'
  | 'queues'
  | 'queue-detail'
  | 'qr-scanner'
  | 'branch-checkin'
  | 'token-display'
  | 'live-tracker'
  | 'my-tickets'
  | 'notifications'
  | 'profile'
  | 'admin-dashboard'
  | 'admin-analytics'
  | 'admin-queues'
  | 'admin-scanner'
  | 'settings'

// ─── USER TYPE ──────────────────────────────────────────
export interface AppUser {
  id: string
  email: string
  name: string
  phone: string | null
  avatar: string | null
  role: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt?: string
  updatedAt?: string
}

// ─── QUEUE TYPE ─────────────────────────────────────────
export interface AppQueue {
  id: string
  name: string
  description: string | null
  prefix: string
  status: string
  maxCapacity: number
  currentLength: number
  avgServiceTime: number
  serviceCenterId: string
  ownerId: string
  qrCode: string | null
  scheduledOpen: string | null
  scheduledClose: string | null
  createdAt?: string
  updatedAt?: string
  serviceCenter?: {
    id: string
    name: string
  }
  waitingCount?: number
  servingCount?: number
  completedCount?: number
}

// ─── TOKEN TYPE ─────────────────────────────────────────
export interface AppToken {
  id: string
  tokenNumber: string
  sequenceNum: number
  status: string
  queueId: string
  userId: string
  serviceCounterId: string | null
  calledAt: string | null
  servedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  estimatedWait: number | null
  createdAt: string
  updatedAt?: string
  position?: number
  queueName?: string
}

// ─── NOTIFICATION TYPE ──────────────────────────────────
export interface AppNotification {
  id: string
  userId: string
  title: string
  message: string
  type: string
  isRead: boolean
  data: string | null
  createdAt: string
}

// ─── SETTINGS TYPE ──────────────────────────────────────
export interface AppSettings {
  pushNotifications: boolean
  tokenAlerts: boolean
  queueUpdates: boolean
  soundAlerts: boolean
  vibration: boolean
  liveTracking: boolean
  autoRefresh: boolean
  compactView: boolean
}

const defaultSettings: AppSettings = {
  pushNotifications: true,
  tokenAlerts: true,
  queueUpdates: true,
  soundAlerts: true,
  vibration: true,
  liveTracking: true,
  autoRefresh: true,
  compactView: false,
}

// ─── STORE STATE ────────────────────────────────────────
interface AppState {
  // Navigation
  currentView: AppView
  previousView: AppView | null
  navigate: (view: AppView) => void
  goBack: () => void

  // Auth (persisted)
  user: AppUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (user: AppUser, accessToken: string, refreshToken: string) => void
  logout: () => void

  // Selected items
  selectedQueueId: string | null
  selectedQueue: AppQueue | null
  setSelectedQueue: (queue: AppQueue | null) => void

  selectedToken: AppToken | null
  setSelectedToken: (token: AppToken | null) => void

  // Queues
  queues: AppQueue[]
  setQueues: (queues: AppQueue[]) => void

  // User tokens
  userTokens: AppToken[]
  setUserTokens: (tokens: AppToken[]) => void

  // Notifications
  notifications: AppNotification[]
  setNotifications: (notifications: AppNotification[]) => void
  unreadCount: number
  setUnreadCount: (count: number) => void

  // Loading states
  isLoading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void

  // Real-time
  socketConnected: boolean
  setSocketConnected: (connected: boolean) => void

  // Theme
  theme: 'dark' | 'light'
  toggleTheme: () => void

  // Settings (persisted)
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  updateSetting: (key: keyof AppSettings, value: boolean) => void

  // Sidebar
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  // Refresh trigger (increment to trigger re-fetches across all screens)
  refreshCounter: number
  triggerRefresh: () => void

  // Centered token-called overlay banner. Driven by useTokenAlerts.
  activeAlert: {
    title: string
    message: string
    tokenNumber?: string
    counterName?: string
    at: number
  } | null
  setActiveAlert: (alert: {
    title: string
    message: string
    tokenNumber?: string
    counterName?: string
  } | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Navigation
      currentView: 'splash',
      previousView: null,
      navigate: (view) =>
        set((state) => {
          // Mirror navigation into the browser's history stack so the back
          // button works naturally. We tag the state with a marker so the
          // popstate handler in page.tsx can distinguish our entries.
          if (typeof window !== 'undefined' && state.currentView !== view) {
            try {
              window.history.pushState({ view, app: 'queueseva' }, '')
            } catch {
              // Silently swallow — history operations can fail in sandboxed iframes
              // and we never want to block in-app navigation because of that.
            }
          }
          return {
            previousView: state.currentView,
            currentView: view,
          }
        }),
      goBack: () =>
        set((state) => ({
          currentView: state.previousView || 'dashboard',
          previousView: null,
        })),

      // Auth
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set((state) => {
          // ─── PREVENT GHOST DATA ON LOGIN ─────────────────────────
          // If a different user is signing in, wipe all user-scoped caches
          // so we never paint another user's tokens/notifications/selections
          // for even a single render. We also wipe on first sign-in (state.user
          // is null) for the same reason — there shouldn't be queue/token data
          // sitting in the store before login anyway.
          const sameUser = state.user?.id && state.user.id === user.id
          if (sameUser) {
            return {
              user,
              accessToken,
              refreshToken,
              isAuthenticated: true,
            }
          }
          return {
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            // Reset everything user-scoped — the dashboard / token list will
            // re-fetch fresh data for this user from useEffect on mount.
            queues: [],
            userTokens: [],
            notifications: [],
            unreadCount: 0,
            selectedQueue: null,
            selectedQueueId: null,
            selectedToken: null,
            error: null,
          }
        }),
      logout: () => {
        // Also clear cross-tab session bits so a logout in this tab doesn't
        // leave stale data lying around for the next user who signs in here.
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('queue-seva-tab-id')
          } catch { /* swallow */ }
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          currentView: 'welcome',
          previousView: null,
          queues: [],
          userTokens: [],
          notifications: [],
          unreadCount: 0,
          selectedQueue: null,
          selectedQueueId: null,
          selectedToken: null,
          error: null,
        })
      },

      // Selected items
      selectedQueueId: null,
      selectedQueue: null,
      setSelectedQueue: (queue) =>
        set({
          selectedQueue: queue,
          selectedQueueId: queue?.id || null,
        }),

      selectedToken: null,
      setSelectedToken: (token) => set({ selectedToken: token }),

      // Queues
      queues: [],
      setQueues: (queues) => set({ queues }),

      // User tokens
      userTokens: [],
      setUserTokens: (tokens) => set({ userTokens: tokens }),

      // Notifications
      notifications: [],
      setNotifications: (notifications) => set({ notifications }),
      unreadCount: 0,
      setUnreadCount: (count) => set({ unreadCount: count }),

      // Loading states
      isLoading: false,
      setLoading: (loading) => set({ isLoading: loading }),
      error: null,
      setError: (error) => set({ error }),

      // Real-time
      socketConnected: false,
      setSocketConnected: (connected) => set({ socketConnected: connected }),

      // Theme
      theme: 'dark',
      toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'dark' ? 'light' : 'dark'
        // Update the HTML class for theme reactivity
        if (typeof document !== 'undefined') {
          document.documentElement.className = newTheme
        }
        return { theme: newTheme }
      }),

      // Settings
      settings: defaultSettings,
      setSettings: (settings) => set({ settings }),
      updateSetting: (key, value) => set((state) => ({
        settings: { ...state.settings, [key]: value },
      })),

      // Sidebar
      sidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Refresh trigger
      refreshCounter: 0,
      triggerRefresh: () => set((state) => ({ refreshCounter: state.refreshCounter + 1 })),

      // Active alert banner
      activeAlert: null,
      setActiveAlert: (alert) =>
        set({
          activeAlert: alert ? { ...alert, at: Date.now() } : null,
        }),
    }),
    {
      name: 'queueSevaAuth',
      // Persist auth-related fields, settings, theme, AND the currentView so a
      // refresh keeps the user on the screen they were looking at.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
        settings: state.settings,
        currentView: state.currentView,
      }),
    }
  )
)
