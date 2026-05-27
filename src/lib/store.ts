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
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Navigation
      currentView: 'splash',
      previousView: null,
      navigate: (view) =>
        set((state) => ({
          previousView: state.currentView,
          currentView: view,
        })),
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
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        }),
      logout: () =>
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
          selectedQueue: null,
          selectedToken: null,
        }),

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
    }),
    {
      name: 'queueSevaAuth',
      // Persist auth-related fields AND settings AND theme
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
        settings: state.settings,
      }),
    }
  )
)
