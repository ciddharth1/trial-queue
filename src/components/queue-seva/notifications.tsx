'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CheckCheck, Clock, AlertCircle, CheckCircle2, Zap, Info } from 'lucide-react'
import { useAppStore, type AppNotification } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Header } from './header'
import { Button } from '@/components/ui/button'

const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  TOKEN_CALLED: { icon: Zap, color: 'text-[#4F46E5]', bg: 'bg-[#4F46E5]/10' },
  QUEUE_UPDATE: { icon: Clock, color: 'text-[#06B6D4]', bg: 'bg-[#06B6D4]/10' },
  SUCCESS: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  WARNING: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ERROR: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  INFO: { icon: Info, color: 'text-slate-400', bg: 'bg-slate-800/50' },
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

export function NotificationsScreen() {
  const { user, notifications, setNotifications, unreadCount, setUnreadCount, refreshCounter } = useAppStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNotifications()
  }, [user?.id])

  // Refresh when refreshCounter changes
  useEffect(() => {
    if (refreshCounter > 0) {
      loadNotifications()
    }
  }, [refreshCounter])

  // Auto-poll every 5 seconds — removed.
  // Updates now arrive via socket events → refreshCounter → loadNotifications().

  const loadNotifications = async () => {
    if (!user) return
    setLoading(true)
    try {
      const result = await apiClient.getNotifications()
      if (result.success && result.data) {
        const data = result.data as any
        setNotifications(data.items || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await apiClient.markNotificationsRead(undefined, true)
      setNotifications(
        notifications.map((n) => ({ ...n, isRead: true }))
      )
      setUnreadCount(0)
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title="Notifications" subtitle={`${unreadCount} unread`} showNotifications={false} showQr={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-lg space-y-4">
          {/* Actions */}
          {unreadCount > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
              <Button
                onClick={handleMarkAllRead}
                variant="ghost"
                size="sm"
                className="text-xs text-[#4F46E5] hover:text-[#4338CA]"
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" />
                Mark all as read
              </Button>
            </motion.div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-800/50 bg-slate-900/30" />
              ))}
            </div>
          ) : notifications.length > 0 ? (
            <AnimatePresence>
              {notifications.map((notification, index) => {
                const config = typeConfig[notification.type] || typeConfig.INFO
                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex items-start gap-3 rounded-xl border p-4 ${
                      notification.isRead
                        ? 'border-slate-800/30 bg-slate-900/20'
                        : 'border-[#4F46E5]/10 bg-[#4F46E5]/5'
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                      <config.icon className={`h-4 w-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`text-sm font-semibold ${notification.isRead ? 'text-slate-400' : 'text-white'}`}>
                          {notification.title}
                        </h4>
                        {!notification.isRead && (
                          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4F46E5]" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{notification.message}</p>
                      <p className="mt-1.5 text-[10px] text-slate-600">{timeAgo(notification.createdAt)}</p>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-16"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/30">
                <Bell className="h-8 w-8 text-slate-700" />
              </div>
              <p className="text-sm font-medium text-slate-400">No notifications yet</p>
              <p className="text-xs text-slate-600">You&apos;ll see queue updates and token alerts here</p>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  )
}
