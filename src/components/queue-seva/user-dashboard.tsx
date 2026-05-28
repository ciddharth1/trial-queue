'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ListOrdered,
  Clock,
  Users,
  TrendingUp,
  ArrowRight,
  Plus,
  QrCode,
  Zap,
  Timer,
  LogOut,
  MapPin,
} from 'lucide-react'
import { useAppStore, type AppQueue, type AppToken } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { emitRefresh } from '@/hooks/use-realtime'
import { socketManager } from '@/lib/socket'
import { Header } from './header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

function formatWaitTime(seconds: number | null): string {
  if (!seconds) return '--'
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${hrs}h ${remainMins}m`
}

function QueueCard({ queue, onJoin, onView }: { queue: AppQueue; onJoin: (q: AppQueue) => void; onView: (q: AppQueue) => void }) {
  const occupancyPercent = queue.maxCapacity > 0 ? Math.round((queue.currentLength / queue.maxCapacity) * 100) : 0
  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    PAUSED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    CLOSED: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl border border-outline-variant/30 bg-gradient-to-b from-surface-container/80 to-surface-container/40 p-5 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container/10 text-lg font-bold text-primary">
            {queue.prefix}
          </div>
          <div>
            <h3 className="font-semibold text-on-surface">{queue.name}</h3>
            <p className="text-xs text-on-surface-variant">{queue.description || 'General queue'}</p>
          </div>
        </div>
        <Badge variant="outline" className={statusColors[queue.status] || statusColors.ACTIVE}>
          {queue.status}
        </Badge>
      </div>

      {/* Stats Row */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-surface-container-high/30 p-2.5 text-center">
          <Users className="mx-auto mb-1 h-3.5 w-3.5 text-on-surface-variant" />
          <p className="text-sm font-bold text-on-surface">{queue.currentLength}</p>
          <p className="text-[10px] text-on-surface-variant">In Queue</p>
        </div>
        <div className="rounded-xl bg-surface-container-high/30 p-2.5 text-center">
          <Timer className="mx-auto mb-1 h-3.5 w-3.5 text-on-surface-variant" />
          <p className="text-sm font-bold text-on-surface">{formatWaitTime(queue.avgServiceTime * queue.currentLength)}</p>
          <p className="text-[10px] text-on-surface-variant">Est. Wait</p>
        </div>
        <div className="rounded-xl bg-surface-container-high/30 p-2.5 text-center">
          <TrendingUp className="mx-auto mb-1 h-3.5 w-3.5 text-on-surface-variant" />
          <p className="text-sm font-bold text-on-surface">{queue.maxCapacity - queue.currentLength}</p>
          <p className="text-[10px] text-on-surface-variant">Available</p>
        </div>
      </div>

      {/* Capacity bar */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] text-on-surface-variant">Capacity</span>
          <span className="text-[10px] text-on-surface-variant">{occupancyPercent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary-container to-secondary-container"
            initial={{ width: 0 }}
            animate={{ width: `${occupancyPercent}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={() => onJoin(queue)}
          disabled={queue.status === 'CLOSED' || queue.currentLength >= queue.maxCapacity}
          className="h-9 flex-1 bg-primary-container text-on-primary text-xs font-semibold hover:bg-primary-container/80 disabled:opacity-50"
          size="sm"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Join Queue
        </Button>
        <Button
          onClick={() => onView(queue)}
          variant="outline"
          className="h-9 flex-1 border-outline-variant bg-surface-container-high/50 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          size="sm"
        >
          View Details
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  )
}

function ActiveTokenCard({ token, onLeave }: { token: AppToken; onLeave: (token: AppToken) => void }) {
  const [leaving, setLeaving] = useState(false)
  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    WAITING: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Waiting' },
    CALLED: { color: 'text-primary', bg: 'bg-primary/10', label: 'Called!' },
    SERVING: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Being Served' },
  }
  const config = statusConfig[token.status] || statusConfig.WAITING

  const handleLeave = async () => {
    setLeaving(true)
    try {
      await onLeave(token)
    } finally {
      setLeaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-4 rounded-xl border border-outline-variant/30 bg-surface-container/50 p-4 backdrop-blur-sm"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary-container to-tertiary-container shadow-lg shadow-primary-container/20">
        <span className="text-lg font-bold text-on-primary">{token.tokenNumber}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-on-surface">{token.queueName || 'Queue'}</h4>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.color} ${config.bg}`}>
            {config.label}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-on-surface-variant">
          {token.position && (
            <span className="flex items-center gap-1">
              <ListOrdered className="h-3 w-3" />
              Position #{token.position}
            </span>
          )}
          {token.estimatedWait && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatWaitTime(token.estimatedWait)}
            </span>
          )}
        </div>
      </div>
      {token.status === 'WAITING' && (
        <Button
          onClick={handleLeave}
          disabled={leaving}
          variant="outline"
          size="sm"
          className="h-8 border-error/30 bg-error/5 text-[10px] text-error hover:bg-error/10 hover:border-error/50"
        >
          <LogOut className="mr-1 h-3 w-3" />
          {leaving ? '...' : 'Leave'}
        </Button>
      )}
    </motion.div>
  )
}

export function UserDashboard() {
  const { user, navigate, setSelectedQueue, setQueues, queues, userTokens, setUserTokens, refreshCounter } = useAppStore()
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [queuesRes, tokensRes] = await Promise.all([
        apiClient.getQueues({ status: 'ACTIVE' }),
        user ? apiClient.getTokens({ userId: user.id }) : Promise.resolve(null),
      ])

      if (queuesRes.success && queuesRes.data) {
        const queueItems = (queuesRes.data as any).items || queuesRes.data
        setQueues(Array.isArray(queueItems) ? queueItems : [])
      }
      if (tokensRes?.success && tokensRes.data) {
        const tokenItems = (tokensRes.data as any).items || tokensRes.data
        setUserTokens(Array.isArray(tokenItems) ? tokenItems : [])
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [user, setQueues, setUserTokens])

  useEffect(() => {
    loadData()
  }, [])

  // Refresh when refreshCounter changes (triggered by admin actions or other screens)
  useEffect(() => {
    if (refreshCounter > 0) {
      loadData()
    }
  }, [refreshCounter])

  // Auto-poll every 5 seconds for real-time updates — removed.
  // Updates now arrive via socket events → refreshCounter → loadData().

  const handleJoinQueue = (queue: AppQueue) => {
    setSelectedQueue(queue)
    navigate('queue-detail')
  }

  const handleViewQueue = (queue: AppQueue) => {
    setSelectedQueue(queue)
    navigate('queue-detail')
  }

  const handleLeaveQueue = async (token: AppToken) => {
    try {
      const result = await apiClient.leaveQueue(token.queueId)
      if (result.success) {
        toast.success('You have left the queue')
        setUserTokens(useAppStore.getState().userTokens.filter(t => t.id !== token.id))
        emitRefresh('queue-update')
        emitRefresh('token-update')
        socketManager.emitTokenExpired({
          queueId: token.queueId,
          tokenId: token.id,
          tokenNumber: token.tokenNumber,
          reason: 'CANCELLED',
        })
        loadData()
      } else {
        toast.error(result.error || 'Failed to leave queue')
      }
    } catch (error) {
      console.error('Failed to leave queue:', error)
      toast.error('Failed to leave queue')
    }
  }

  const activeTokens = userTokens.filter((t) => ['WAITING', 'CALLED', 'SERVING'].includes(t.status))

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title="Dashboard" subtitle={`Welcome back, ${user?.name?.split(' ')[0] || 'User'}`} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <button
              onClick={() => navigate('qr-scanner')}
              className="flex flex-1 items-center gap-3 rounded-2xl border border-primary-container/20 bg-primary-container/5 p-4 transition-all hover:border-primary-container/40 hover:bg-primary-container/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container/20">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-on-surface">Branch Check-in</p>
                <p className="text-[11px] text-on-surface-variant">Scan QR or enter code</p>
              </div>
            </button>
            <button
              onClick={() => navigate('queues')}
              className="flex flex-1 items-center gap-3 rounded-2xl border border-secondary-container/20 bg-secondary-container/5 p-4 transition-all hover:border-secondary-container/40 hover:bg-secondary-container/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-container/20">
                <Zap className="h-5 w-5 text-secondary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-on-surface">Browse Queues</p>
                <p className="text-[11px] text-on-surface-variant">View all active queues</p>
              </div>
            </button>
          </motion.div>

          {/* Active Tokens */}
          {activeTokens.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <Zap className="h-4 w-4 text-primary" />
                  Your Active Tokens
                </h2>
                <button
                  onClick={() => navigate('my-tickets')}
                  className="text-xs text-primary hover:underline"
                >
                  View All Tickets
                </button>
              </div>
              <div className="space-y-3">
                {activeTokens.map((token) => (
                  <ActiveTokenCard key={token.id} token={token} onLeave={handleLeaveQueue} />
                ))}
              </div>
            </motion.div>
          )}

          {/* Available Queues */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                <ListOrdered className="h-4 w-4 text-primary" />
                Available Queues
              </h2>
              <button
                onClick={() => navigate('queues')}
                className="text-xs text-primary hover:underline"
              >
                View All
              </button>
            </div>
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl border border-outline-variant/30 bg-surface-container/30" />
                ))}
              </div>
            ) : queues.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {queues.slice(0, 6).map((queue) => (
                  <QueueCard key={queue.id} queue={queue} onJoin={handleJoinQueue} onView={handleViewQueue} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant p-8 text-center">
                <ListOrdered className="h-10 w-10 text-on-surface-variant" />
                <p className="text-sm text-on-surface-variant">No active queues available</p>
                <p className="text-xs text-on-surface-variant">Check back later or scan a QR code to join</p>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  )
}
