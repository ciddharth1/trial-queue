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
      return <LayoutWithSidebar><QRScannerScreen /></LayoutWithSidebar>
    case 'branch-checkin':
      return <LayoutWithSidebar><BranchCheckinScreen /></LayoutWithSidebar>
    case 'token-display':
      return <LayoutWithSidebar><TokenDisplayScreen /></LayoutWithSidebar>
    case 'live-tracker':
      return <LayoutWithSidebar><LiveTrackerScreen /></LayoutWithSidebar>
    case 'my-tickets':
      return <LayoutWithSidebar><MyTicketsScreen /></LayoutWithSidebar>
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

// Layout wrapper with sidebar for authenticated views.
// Uses 100dvh so the layout resizes correctly when mobile browsers show/hide
// their URL bar. The inner column uses min-h-0 so flex children can scroll
// without their content being clipped.
function LayoutWithSidebar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col">
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
  const { currentView, navigate, goBack } = useAppStore()
  // We deliberately do NOT subscribe to isAuthenticated / user here. Zustand's
  // persist middleware can hydrate after the first render — if we read from
  // closure values we'd capture the pre-hydration nulls and bounce a logged-in
  // user back to /welcome on every refresh. Instead, the splash effect below
  // reads the freshly-hydrated state via getState() when its timer fires.
  const accessToken = useAppStore((s) => s.accessToken)
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

    // Wait for Zustand persist middleware to finish rehydrating before we
    // make any navigation decisions. `onFinishHydration` fires the moment
    // the store has been populated from localStorage. If hydration already
    // completed (common when persist is synchronous), the listener fires
    // immediately on the next tick.
    const persistApi = (useAppStore as unknown as {
      persist?: {
        hasHydrated: () => boolean
        onFinishHydration: (cb: () => void) => () => void
      }
    }).persist

    const decideNavigation = () => {
      const { isAuthenticated, user, currentView } = useAppStore.getState()
      const delay = isAuthenticated && user
        ? SPLASH_DURATION_AUTHED_MS
        : SPLASH_DURATION_UNAUTHED_MS

      const timer = setTimeout(() => {
        const state = useAppStore.getState() // re-read in case auth changed mid-splash
        if (state.isAuthenticated && state.user) {
          apiClient.setAccessToken(state.accessToken)
          const target = state.user.role === 'ADMIN' || state.user.role === 'SUPER_ADMIN'
            ? 'admin-dashboard'
            : 'dashboard'
          // Only redirect to dashboard from non-app views (splash/welcome/login/register).
          // If the user explicitly navigated somewhere (e.g. token-display), keep them there.
          const transientViews: AppView[] = ['splash', 'welcome', 'login', 'register']
          if (transientViews.includes(state.currentView)) {
            state.navigate(target as AppView)
          }
        } else if (currentView === 'splash') {
          state.navigate('welcome')
        }
        setHydrated(true)
      }, delay)
      return () => clearTimeout(timer)
    }

    if (!persistApi || persistApi.hasHydrated()) {
      return decideNavigation()
    }
    // Wait for hydration; we still cap the wait so we never hang on splash.
    let cleanup: (() => void) | undefined
    const fallback = setTimeout(() => {
      cleanup = decideNavigation()
    }, 500)
    const off = persistApi.onFinishHydration(() => {
      clearTimeout(fallback)
      cleanup = decideNavigation()
    })
    return () => {
      clearTimeout(fallback)
      off()
      cleanup?.()
    }
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
          className="min-h-dvh"
        >
          <ViewRouter view={currentView} />
        </motion.div>
      </AnimatePresence>
    </>
  )
}
