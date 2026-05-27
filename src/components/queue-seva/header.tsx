'use client'

import { Menu, Bell, QrCode, Wifi, WifiOff, MapPin } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { motion } from 'framer-motion'

interface HeaderProps {
  title: string
  subtitle?: string
  showNotifications?: boolean
  showQr?: boolean
}

export function Header({ title, subtitle, showNotifications = true, showQr = true }: HeaderProps) {
  const { toggleSidebar, navigate, unreadCount, socketConnected } = useAppStore()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{title}</h1>
          {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Socket status */}
        <motion.div
          className="flex items-center gap-1.5 rounded-full border border-outline-variant/50 bg-surface-container/50 px-2.5 py-1"
          animate={{ opacity: socketConnected ? 1 : 0.5 }}
        >
          {socketConnected ? (
            <Wifi className="h-3 w-3 text-emerald-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-on-surface-variant" />
          )}
          <span className="text-[10px] text-on-surface-variant">
            {socketConnected ? 'Live' : 'Offline'}
          </span>
        </motion.div>

        {showQr && (
          <button
            onClick={() => navigate('qr-scanner')}
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            <MapPin className="h-5 w-5" />
          </button>
        )}

        {showNotifications && (
          <button
            onClick={() => navigate('notifications')}
            className="relative rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-container px-1 text-[9px] font-bold text-on-primary"
              >
                {unreadCount}
              </motion.span>
            )}
          </button>
        )}
      </div>
    </header>
  )
}
