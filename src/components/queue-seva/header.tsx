'use client'

import { Menu, Bell, QrCode, Wifi, WifiOff } from 'lucide-react'
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800/50 bg-[#0F172A]/80 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Socket status */}
        <motion.div
          className="flex items-center gap-1.5 rounded-full border border-slate-800/50 bg-slate-900/50 px-2.5 py-1"
          animate={{ opacity: socketConnected ? 1 : 0.5 }}
        >
          {socketConnected ? (
            <Wifi className="h-3 w-3 text-emerald-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-slate-500" />
          )}
          <span className="text-[10px] text-slate-500">
            {socketConnected ? 'Live' : 'Offline'}
          </span>
        </motion.div>

        {showQr && (
          <button
            onClick={() => navigate('qr-scanner')}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-[#4F46E5]"
          >
            <QrCode className="h-5 w-5" />
          </button>
        )}

        {showNotifications && (
          <button
            onClick={() => navigate('notifications')}
            className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-[#4F46E5]"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4F46E5] px-1 text-[9px] font-bold text-white"
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
