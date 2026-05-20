'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore, type AppView } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { useSocketConnection } from '@/hooks/use-realtime'

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
      return <BranchCheckinScreen />
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

export default function Home() {
  const { currentView, isAuthenticated, user, accessToken, navigate } = useAppStore()
  const [initialized, setInitialized] = useState(false)

  // Initialize Socket.io connection
  useSocketConnection()

  // On mount, navigate based on auth state (persisted by Zustand)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated && user) {
        apiClient.setAccessToken(accessToken)
        navigate(user.role === 'ADMIN' ? 'admin-dashboard' : 'dashboard')
      } else {
        navigate('welcome')
      }
      setInitialized(true)
    }, 2500)

    return () => clearTimeout(timer)
  }, [])

  // Sync API client token when auth changes
  useEffect(() => {
    if (accessToken) {
      apiClient.setAccessToken(accessToken)
    }
  }, [accessToken])

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
