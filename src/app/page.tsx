'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore, type AppView } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { useSocketConnection } from '@/hooks/use-realtime'
import { useTokenAlerts } from '@/hooks/use-token-alerts'

// Import all screen components
import { SplashScreen } from '@/components/queue-seva/splash-screen'
import { WelcomeScreen } from '@/components/queue-seva/welcome-screen'
import { LoginScreen, RegisterScreen } from '@/components/queue-seva/auth-screens'
import { Sidebar } from '@/components/queue-seva/sidebar'
import { UserDashboard } from '@/components/queue-seva/user-dashboard'
import { QueueDetailScreen } from '@/components/queue-seva/queue-detail'
import { TokenDisplayScreen } from '@/components/queue-seva/token-display'
import { LiveTrackerScreen } from '@/components/queue-seva/live-tracker'
import { QRScannerScreen } from '@/components/queue-seva/qr-scanner'
import { BranchCheckinScreen } from '@/components/queue-seva/branch-checkin'
import { MyTicketsScreen } from '@/components/queue-seva/my-tickets'
import { NotificationsScreen } from '@/components/queue-seva/notifications'
import { ProfileScreen } from '@/components/queue-seva/profile-screen'
import { SettingsScreen } from '@/components/queue-seva/settings-screen'
import { AdminDashboard } from '@/components/queue-seva/admin-dashboard'
import { AdminAnalyticsScreen } from '@/components/queue-seva/admin-analytics'
import { AdminQueuesScreen } from '@/components/queue-seva/admin-queues'
import { AdminScannerScreen } from '@/components/queue-seva/admin-scanner'
import { QueuesListScreen } from '@/components/queue-seva/queues-list'
import { ThemeInitializer } from '@/components/queue-seva/theme-initializer'

// View router mapping
function ViewRouter({ view }: { view: AppView }) {
  switch (view) {
    case 'splash':
      return <SplashScreen />
    case 'welcome':
      return <WelcomeScreen />
    case 'login':
      return <LoginScreen />
    case 'register':
      return <RegisterScreen />
    case 'dashboard':
      return <LayoutWithSidebar><UserDashboard /></LayoutWithSidebar>
    case 'queues':
      return <LayoutWithSidebar><QueuesListScreen /></LayoutWithSidebar>
    case 'queue-detail':
      return <LayoutWithSidebar><QueueDetailScreen /></LayoutWithSidebar>
    case 'qr-scanner':
      return <QRScannerScreen />
    case 'branch-checkin':
      return <BranchCheckinScreen />
    case 'token-display':
      return <LayoutWithSidebar><TokenDisplayScreen /></LayoutWithSidebar>
    case 'live-tracker':
      return <LiveTrackerScreen />
    case 'my-tickets':
      return <MyTicketsScreen />
    case 'notifications':
      return <LayoutWithSidebar><NotificationsScreen /></LayoutWithSidebar>
    case 'profile':
      return <LayoutWithSidebar><ProfileScreen /></LayoutWithSidebar>
    case 'settings':
      return <LayoutWithSidebar><SettingsScreen /></LayoutWithSidebar>
    case 'admin-dashboard':
      return <LayoutWithSidebar><AdminDashboard /></LayoutWithSidebar>
    case 'admin-analytics':
      return <LayoutWithSidebar><AdminAnalyticsScreen /></LayoutWithSidebar>
    case 'admin-queues':
      return <LayoutWithSidebar><AdminQueuesScreen /></LayoutWithSidebar>
    case 'admin-scanner':
      return <LayoutWithSidebar><AdminScannerScreen /></LayoutWithSidebar>
    default:
      return <LayoutWithSidebar><UserDashboard /></LayoutWithSidebar>
  }
}

// Layout wrapper with sidebar for authenticated views
function LayoutWithSidebar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}

// Reasonable lifetimes for the splash. We never linger artificially when the
// user is already authenticated — the splash exists to mask the Zustand
// hydration race, not to be a marketing screen.
const SPLASH_DURATION_AUTHED_MS = 350
const SPLASH_DURATION_UNAUTHED_MS = 800

export default function Home() {
  const { currentView, isAuthenticated, user, accessToken, navigate, goBack } = useAppStore()
  const [hydrated, setHydrated] = useState(false)
  const initializedRef = useRef(false)

  // Initialize Socket.io connection
  useSocketConnection()

  // Wire persisted settings (token alerts, sound, vibration, push) to real side effects.
  useTokenAlerts()

  // Hydrate the persisted store on first mount, then redirect based on auth state.
  // Runs exactly once. After this point, all navigation is store-driven.
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const delay = isAuthenticated && user
      ? SPLASH_DURATION_AUTHED_MS
      : SPLASH_DURATION_UNAUTHED_MS

    const timer = setTimeout(() => {
      if (isAuthenticated && user) {
        apiClient.setAccessToken(accessToken)
        const target = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
          ? 'admin-dashboard'
          : 'dashboard'
        navigate(target as AppView)
      } else if (currentView === 'splash') {
        navigate('welcome')
      }
      setHydrated(true)
    }, delay)

    return () => clearTimeout(timer)
    // We intentionally only run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync API client token whenever auth state changes
  useEffect(() => {
    apiClient.setAccessToken(accessToken)
  }, [accessToken])

  // ─── BROWSER BACK BUTTON SUPPORT ─────────────────────────
  // The app navigates via Zustand. To make the browser back button feel
  // natural, we mirror navigation into history.pushState and listen for
  // popstate events — converting them into in-store goBack() calls.
  useEffect(() => {
    if (!hydrated) return
    if (typeof window === 'undefined') return

    // Push the current view onto history so the next back press has something
    // to pop into. We tag it with a marker so we know it's ours.
    window.history.replaceState({ view: currentView, app: 'queueseva' }, '')
  }, [hydrated, currentView])

  useEffect(() => {
    if (!hydrated) return
    if (typeof window === 'undefined') return

    const onPopState = (event: PopStateEvent) => {
      // Only handle pops we created ourselves.
      if (event.state && event.state.app === 'queueseva') {
        // Re-push so the user stays on the app even if they hit back again
        // before a navigation event registers a new state.
        goBack()
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [hydrated, goBack])

  return (
    <>
      <ThemeInitializer />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-screen overflow-hidden"
        >
          <ViewRouter view={currentView} />
        </motion.div>
      </AnimatePresence>
    </>
  )
}
