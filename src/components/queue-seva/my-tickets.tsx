'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  QrCode,
  Search,
  MoreVertical,
  Home,
  Ticket,
  Bell,
  User,
  Eye,
  LogOut,
  Receipt,
  Bolt,
  ArrowRight,
} from 'lucide-react'
import { useAppStore, type AppToken } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { emitRefresh } from '@/hooks/use-realtime'
import { socketManager } from '@/lib/socket'
import { Header } from './header'
import { toast } from 'sonner'

function formatWaitTime(seconds: number | null): string {
  if (!seconds) return '--'
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// Format a timestamp as a short time-of-day string. Returns '--' when null.
function formatTime(iso: string | null | undefined): string {
  if (!iso) return '--'
  try {
    return new Date(iso).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return '--'
  }
}

// Compute "checked in" → "checked out" duration in minutes. Returns null when
// either timestamp is missing.
function durationMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null
  return Math.round((b - a) / 60000)
}

interface HistoryTicket {
  id: string
  tokenNumber: string
  service: string
  date: string
  status: 'Completed' | 'Missed' | 'Cancelled'
  queueId: string
}

export function MyTicketsScreen() {
  const { user, navigate, userTokens, setUserTokens, selectedToken, setSelectedToken, refreshCounter } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadTickets = useCallback(async (opts?: { background?: boolean }) => {
    if (!user) { setLoading(false); return }
    if (!opts?.background) setLoading(true)
    try {
      const result = await apiClient.getTokens({ userId: user.id, pageSize: 50 })
      if (result.success && result.data) {
        const items = (result.data as any).items || result.data
        setUserTokens(Array.isArray(items) ? items : [])
      }
    } catch (error) {
      console.error('Failed to load tickets:', error)
    } finally {
      setLoading(false)
    }
  }, [user, setUserTokens])

  useEffect(() => {
    loadTickets()
  }, [])

  // Background refresh on socket events.
  useEffect(() => {
    if (refreshCounter > 0) loadTickets({ background: true })
  }, [refreshCounter])

  const activeTickets = userTokens.filter((t) => ['WAITING', 'CALLED', 'SERVING'].includes(t.status))
  const pastTickets = userTokens.filter((t) => ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(t.status))

  const handleLeaveQueue = async (token: AppToken) => {
    setLeavingId(token.id)
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
      } else {
        toast.error(result.error || 'Failed to leave queue')
      }
    } catch (error) {
      console.error('Failed to leave queue:', error)
      toast.error('Failed to leave queue')
    } finally {
      setLeavingId(null)
    }
  }

  const handleViewDetails = (token: AppToken) => {
    setSelectedToken(token)
    navigate('live-tracker')
  }

  const statusConfig: Record<string, { color: string; bg: string; borderColor: string; label: string; dotColor: string }> = {
    WAITING: { color: 'text-[#ffa000]', bg: 'bg-[#2d2216]', borderColor: 'border-[#ffa000]/20', label: 'Waiting', dotColor: 'bg-[#ffa000]' },
    CALLED: { color: 'text-primary', bg: 'bg-primary/10', borderColor: 'border-primary/20', label: 'Called!', dotColor: 'bg-primary' },
    SERVING: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20', label: 'Being Served', dotColor: 'bg-emerald-400' },
    COMPLETED: { color: 'text-[#4caf50]', bg: 'bg-[#1b2b20]', borderColor: 'border-[#4caf50]/20', label: 'Completed', dotColor: '' },
    CANCELLED: { color: 'text-error', bg: 'bg-[#311c1c]', borderColor: 'border-error/20', label: 'Cancelled', dotColor: '' },
    EXPIRED: { color: 'text-error', bg: 'bg-[#311c1c]', borderColor: 'border-error/20', label: 'Missed', dotColor: '' },
  }

  const totalTickets = userTokens.length
  const avgFlow = pastTickets.length > 0
    ? Math.round(pastTickets.reduce((acc, t) => acc + (t.estimatedWait || 0), 0) / pastTickets.length / 60)
    : 0
  const pointsEarned = pastTickets.filter(t => t.status === 'COMPLETED').length * 50

  return (
    <div className="flex flex-1 flex-col bg-background pb-24 md:pb-0">
      <Header title="My Tickets" subtitle="Your active and past service entries" showQr={false} />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-16 max-w-[1280px] mx-auto w-full pt-4">
        {/* Header Section */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-on-surface" style={{ fontFamily: 'var(--font-plus-jakarta)', fontSize: 'clamp(24px, 4vw, 32px)', lineHeight: 1.2, fontWeight: 800 }}>
              My Tickets
            </h2>
            <p className="text-on-surface-variant mt-1" style={{ fontSize: '16px', lineHeight: 1.5 }}>
              Manage your active service entries and history.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('branch-checkin')}
              className="flex items-center gap-2 bg-primary-container text-on-primary px-6 py-2 rounded-xl font-bold active:scale-95 transition-all shadow-lg"
              style={{ boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)' }}
            >
              <QrCode className="h-4 w-4" />
              <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Scan QR</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="glass-panel p-4 rounded-xl flex flex-col gap-1">
            <span className="text-on-surface-variant text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Total Tickets</span>
            <span className="text-secondary font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '24px', fontWeight: 700, lineHeight: 1 }}>{totalTickets}</span>
          </div>
          <div className="glass-panel p-4 rounded-xl flex flex-col gap-1 border-l-2 border-l-secondary">
            <span className="text-on-surface-variant text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Avg. Flow</span>
            <span className="text-on-surface font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '24px', fontWeight: 700, lineHeight: 1 }}>{avgFlow}m</span>
          </div>
          <div className="glass-panel p-4 rounded-xl flex flex-col gap-1">
            <span className="text-on-surface-variant text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Active</span>
            <span className="text-primary font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '24px', fontWeight: 700, lineHeight: 1 }}>{String(activeTickets.length).padStart(2, '0')}</span>
          </div>
          <div className="glass-panel p-4 rounded-xl flex flex-col gap-1">
            <span className="text-on-surface-variant text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Points</span>
            <span className="text-tertiary font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '24px', fontWeight: 700, lineHeight: 1 }}>{pointsEarned}</span>
          </div>
        </section>

        {/* Active Tickets */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-on-surface flex items-center gap-2" style={{ fontFamily: 'var(--font-plus-jakarta)', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>
              <Bolt className="h-5 w-5 text-primary" />
              Active Entries
            </h3>
            <button
              onClick={() => navigate('live-tracker')}
              className="text-primary text-xs font-medium hover:underline"
              style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}
            >
              Track Live
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="glass-panel rounded-xl p-4 animate-pulse h-40" />
              ))}
            </div>
          ) : activeTickets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeTickets.map((token) => {
                const config = statusConfig[token.status] || statusConfig.WAITING
                return (
                  <motion.div
                    key={token.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel rounded-xl overflow-hidden group hover:border-primary/50 transition-all duration-300"
                  >
                    <div className="p-4 flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 ${token.status === 'WAITING' ? 'bg-primary/10 border-primary/20' : 'bg-secondary/10 border-secondary/20'} border rounded-lg flex items-center justify-center`} style={{ boxShadow: token.status === 'WAITING' ? '0 0 20px -5px rgba(195, 192, 255, 0.4)' : '0 0 20px -5px rgba(76, 215, 246, 0.4)' }}>
                          <span className={`font-bold ${token.status === 'WAITING' ? 'text-primary' : 'text-secondary'}`} style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '14px', fontWeight: 700, letterSpacing: '0.05em' }}>
                            {token.tokenNumber}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-on-surface font-semibold text-lg" style={{ fontFamily: 'var(--font-plus-jakarta)', fontWeight: 600 }}>{token.queueName || 'Queue'}</h4>
                          <p className="text-on-surface-variant text-sm flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Est. Wait: {formatWaitTime(token.estimatedWait)}
                          </p>
                          <p className="text-[11px] text-on-surface-variant mt-1">
                            Checked in: <span className="font-mono">{formatTime(token.createdAt)}</span>
                            {token.servedAt && (
                              <>
                                {' · '}Started: <span className="font-mono">{formatTime(token.servedAt)}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className={`${config.bg} ${config.color} text-xs px-3 py-1 rounded-full border ${config.borderColor} flex items-center gap-1.5 font-medium`} style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>
                        {config.dotColor && <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor} animate-pulse`} />}
                        {config.label}
                      </span>
                    </div>
                    <div className="px-4 pb-4 flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetails(token)}
                        className="flex-1 bg-surface-container-highest/30 hover:bg-surface-container-highest/60 text-on-surface text-xs font-medium py-2.5 rounded-lg transition-colors border border-white/5 flex items-center justify-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Details
                      </button>
                      {token.status === 'WAITING' && (
                        <button
                          onClick={() => handleLeaveQueue(token)}
                          disabled={leavingId === token.id}
                          className="px-6 bg-error/10 hover:bg-error/20 text-error text-xs font-medium py-2.5 rounded-lg transition-colors border border-error/20 flex items-center gap-2 disabled:opacity-50"
                        >
                          <LogOut className="h-4 w-4" />
                          {leavingId === token.id ? '...' : 'Leave'}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
              <Ticket className="h-10 w-10 text-on-surface-variant" />
              <p className="text-sm text-on-surface-variant">No active tickets</p>
              <p className="text-xs text-on-surface-variant">Join a queue to get started</p>
              <button
                onClick={() => navigate('branch-checkin')}
                className="mt-2 px-6 py-2 bg-primary-container text-on-primary font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all text-sm"
              >
                Check-in Now
              </button>
            </div>
          )}
        </section>

        {/* Service History */}
        <section className="mb-10">
          <h3 className="text-on-surface mb-4" style={{ fontFamily: 'var(--font-plus-jakarta)', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>History</h3>
          {pastTickets.length > 0 ? (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-high/50 border-b border-white/5">
                    <tr>
                      <th className="p-4 text-on-surface-variant text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Ticket</th>
                      <th className="p-4 text-on-surface-variant text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Service</th>
                      <th className="p-4 text-on-surface-variant text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Date</th>
                      <th className="p-4 text-on-surface-variant text-xs font-medium hidden sm:table-cell" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Check-in / Check-out</th>
                      <th className="p-4 text-on-surface-variant text-xs font-medium hidden md:table-cell" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Duration</th>
                      <th className="p-4 text-on-surface-variant text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Status</th>
                      <th className="p-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pastTickets.slice(0, 10).map((token) => {
                      const config = statusConfig[token.status] || statusConfig.COMPLETED
                      // For COMPLETED tokens we use completedAt; for CANCELLED/EXPIRED
                      // we use updatedAt as the closest "exit" timestamp since
                      // there's no explicit `leftAt` on the Token model.
                      const checkOut = token.completedAt ?? token.updatedAt ?? null
                      const dur = durationMinutes(token.createdAt, checkOut)
                      return (
                        <tr key={token.id} className="hover:bg-surface-container-highest/20 transition-colors">
                          <td className="p-4 text-primary font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>{token.tokenNumber}</td>
                          <td className="p-4 text-on-surface">{token.queueName || 'Service'}</td>
                          <td className="p-4 text-on-surface-variant">
                            {new Date(token.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="p-4 hidden sm:table-cell text-on-surface-variant text-xs font-mono whitespace-nowrap">
                            {formatTime(token.createdAt)}
                            {' → '}
                            {checkOut ? formatTime(checkOut) : <span className="text-on-surface-variant/60">still in queue</span>}
                          </td>
                          <td className="p-4 hidden md:table-cell text-on-surface-variant text-xs">
                            {dur !== null ? `${dur} min` : '—'}
                          </td>
                          <td className="p-4">
                            <span className={`${config.bg} ${config.color} text-xs px-2 py-0.5 rounded border ${config.borderColor} font-medium`}>
                              {config.label}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button className="text-on-surface-variant hover:text-primary transition-colors">
                              <Receipt className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
              <Receipt className="h-10 w-10 text-on-surface-variant" />
              <p className="text-sm text-on-surface-variant">No history yet</p>
              <p className="text-xs text-on-surface-variant">Your completed service entries will appear here</p>
            </div>
          )}
        </section>

        {/* Premium Promotion Card */}
        <section className="mb-10 relative overflow-hidden rounded-2xl glass-panel p-6 group">
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="max-w-md">
              <span className="text-tertiary text-xs uppercase tracking-widest font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.1em' }}>Premium Benefit</span>
              <h4 className="text-on-surface mt-2" style={{ fontFamily: 'var(--font-plus-jakarta)', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>Skip the line with SevaPriority</h4>
              <p className="text-on-surface-variant mt-2 text-sm" style={{ lineHeight: 1.5 }}>Get priority access to express counters and real-time transit alerts for your next visit.</p>
              <button className="mt-4 bg-tertiary text-on-tertiary font-bold px-6 py-2 rounded-xl hover:shadow-[0_0_20px_-5px_#ddb7ff] transition-all active:scale-95">
                Upgrade Now
              </button>
            </div>
            <div className="w-full md:w-64 h-40 rounded-xl overflow-hidden shadow-2xl bg-gradient-to-br from-primary/20 to-tertiary/20 flex items-center justify-center">
              <QrCode className="h-16 w-16 text-tertiary/50" />
            </div>
          </div>
          {/* Decorative Gradients */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-tertiary/10 rounded-full blur-[100px]"></div>
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-primary/10 rounded-full blur-[100px]"></div>
        </section>
      </main>

      {/* Bottom Navigation Bar (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pt-2 pb-6 h-20 backdrop-blur-lg border-t border-white/5 bg-surface-container-low/95 shadow-lg rounded-t-xl">
        <button onClick={() => navigate('dashboard')} className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90">
          <Home className="h-5 w-5" />
          <span className="mt-1 text-xs">Home</span>
        </button>
        <button onClick={() => navigate('my-tickets')} className="flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-full px-5 py-1.5 transition-all active:scale-90">
          <Ticket className="h-5 w-5" style={{ fontVariationSettings: "'FILL' 1" }} />
          <span className="mt-1 text-xs">My Tickets</span>
        </button>
        <button onClick={() => navigate('notifications')} className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90">
          <Bell className="h-5 w-5" />
          <span className="mt-1 text-xs">Alerts</span>
        </button>
        <button onClick={() => navigate('profile')} className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90">
          <User className="h-5 w-5" />
          <span className="mt-1 text-xs">Profile</span>
        </button>
      </nav>
    </div>
  )
}
