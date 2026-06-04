'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  ListOrdered,
  ArrowRight,
  Radio,
  CheckCircle2,
  Bell,
  QrCode,
  LogOut,
  MoreVertical,
  Home,
  Ticket,
  User,
} from 'lucide-react'
import { useAppStore, type AppToken, type AppQueue } from '@/lib/store'
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

interface LivePosition {
  position: number
  tokenNumber: string
  status: 'you' | 'serving' | 'waiting' | 'completed'
  estimatedWait: number
  tokenId: string
  userName: string
}

export function LiveTrackerScreen() {
  const { userTokens, selectedToken, navigate, refreshCounter, user, setUserTokens } = useAppStore()
  const [livePositions, setLivePositions] = useState<LivePosition[]>([])
  const [loading, setLoading] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [currentPosition, setCurrentPosition] = useState(0)
  const [totalInQueue, setTotalInQueue] = useState(0)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState({ title: '', subtitle: '' })

  // Source of truth: backend.
  // We always prefer the freshest userTokens entry over the in-memory
  // `selectedToken` (which can be stale after a refresh — `selectedToken` is
  // not persisted across reloads). If userTokens has any active entry we use
  // it; only as a last fallback do we look at selectedToken.
  const liveActiveFromTokens = userTokens.find((t) =>
    ['WAITING', 'CALLED', 'SERVING'].includes(t.status),
  )
  const activeToken: AppToken | null =
    liveActiveFromTokens ||
    (selectedToken && ['WAITING', 'CALLED', 'SERVING'].includes(selectedToken.status)
      ? selectedToken
      : null)

  // ─── Bootstrap: on every mount, fetch the user's tokens from the server.
  // This is what makes a refresh "remember" the active ticket — it's not
  // stored client-side, but the backend always knows which tokens are still
  // in the WAITING/CALLED/SERVING states for this user.
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      if (!user) {
        setBootstrapping(false)
        return
      }
      try {
        const result = await apiClient.getTokens({ userId: user.id, pageSize: 50 })
        if (cancelled) return
        if (result.success && result.data) {
          const items = (result.data as { items?: AppToken[] }).items || (result.data as unknown as AppToken[]) || []
          setUserTokens(Array.isArray(items) ? items : [])
        }
      } catch (err) {
        console.error('[live-tracker] bootstrap failed:', err)
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [user, setUserTokens])

  const loadRealData = useCallback(async () => {
    if (!activeToken) {
      setLoading(false)
      return
    }

    try {
      const tokensRes = await apiClient.getTokens({ queueId: activeToken.queueId, pageSize: 50 })
      if (tokensRes.success && tokensRes.data) {
        const items = (tokensRes.data as any).items || tokensRes.data
        const allTokens: any[] = Array.isArray(items) ? items : []

        const positions: LivePosition[] = []
        let myPosition = 0

        for (const token of allTokens) {
          if (token.status === 'COMPLETED' || token.status === 'CANCELLED' || token.status === 'EXPIRED') continue

          // CRITICAL FIX: Skip tokens without backend position (race condition safety)
          // Backend is SINGLE SOURCE OF TRUTH - never calculate client-side
          if (token.status === 'WAITING' && !token.position) {
            console.warn(`[live-tracker] Token ${token.id} missing position, skipping until backend recalculates`)
            continue
          }

          const isMe = token.id === activeToken.id
          const status: LivePosition['status'] =
            isMe ? 'you' :
            token.status === 'SERVING' ? 'serving' :
            token.status === 'CALLED' ? 'serving' :
            'waiting'

          // CRITICAL: Trust backend position - never recalculate client-side
          if (isMe) {
            myPosition = token.position || 0
          }

          positions.push({
            position: token.position || 0, // Backend provides position, fallback to 0 (never calculate)
            tokenNumber: token.tokenNumber,
            status,
            estimatedWait: token.estimatedWait || 0,
            tokenId: token.id,
            userName: token.user?.name || 'User',
          })
        }

        // Sort by position (backend provides correct order)
        positions.sort((a, b) => a.position - b.position)

        setLivePositions(positions)
        setCurrentPosition(myPosition)
        setTotalInQueue(positions.filter(p => p.status !== 'completed').length)

        // Debug logging for position tracking
        if (myPosition > 0) {
          console.log(`[live-tracker] Position update: ${myPosition}, people ahead: ${myPosition - 1}, total in queue: ${positions.length}`)
        }
      }
    } catch (error) {
      console.error('Failed to load live data:', error)
    } finally {
      setLoading(false)
    }
  }, [activeToken])

  useEffect(() => {
    loadRealData()
  }, [])

  useEffect(() => {
    if (refreshCounter > 0) loadRealData()
  }, [refreshCounter])

  // Refresh specific token for status changes (driven by socket events via refreshCounter)
  const [tokenDetail, setTokenDetail] = useState<any>(null)
  const refreshTokenDetail = useCallback(async () => {
    if (!activeToken) return
    try {
      const result = await apiClient.getToken(activeToken.id)
      if (result.success && result.data) {
        setTokenDetail(result.data)
        if ((result.data as any).currentPosition) {
          setCurrentPosition((result.data as any).currentPosition)
        }
        if ((result.data as any).status === 'CALLED' && activeToken.status === 'WAITING') {
          useAppStore.getState().setSelectedToken({
            ...activeToken,
            status: 'CALLED',
            calledAt: (result.data as any).calledAt,
          })
          setToastMessage({ title: 'It\'s your turn!', subtitle: 'Please proceed to the counter' })
          setShowToast(true)
          setTimeout(() => setShowToast(false), 5000)
          }
        }
      } catch (error) {
        console.error('Failed to refresh token:', error)
      }
  }, [activeToken])

  // Trigger token detail refresh on socket events
  useEffect(() => {
    if (refreshCounter > 0) refreshTokenDetail()
  }, [refreshCounter, refreshTokenDetail])

  const handleLeaveQueue = async () => {
    if (!activeToken) return
    setLeaving(true)
    try {
      const result = await apiClient.leaveQueue(activeToken.queueId)
      if (result.success) {
        toast.success('You have left the queue')
        setUserTokens(useAppStore.getState().userTokens.filter(t => t.id !== activeToken.id))
        emitRefresh('queue-update')
        emitRefresh('token-update')
        socketManager.emitTokenExpired({
          queueId: activeToken.queueId,
          tokenId: activeToken.id,
          tokenNumber: activeToken.tokenNumber,
          reason: 'CANCELLED',
        })
        navigate('my-tickets')
      } else {
        toast.error(result.error || 'Failed to leave queue')
      }
    } catch (error) {
      console.error('Failed to leave queue:', error)
      toast.error('Failed to leave queue')
    } finally {
      setLeaving(false)
    }
  }

  const peopleAhead = Math.max(0, currentPosition - 1)
  const estimatedWaitSeconds = activeToken?.estimatedWait || currentPosition * 300

  if (!activeToken) {
    // While bootstrap is in flight, show a loader instead of the empty state.
    // Otherwise on every refresh you'd see "No active token" for ~300ms before
    // the token list arrives and the screen swaps in.
    if (bootstrapping) {
      return (
        <div className="flex flex-1 flex-col bg-background pb-24 md:pb-0">
          <Header title="Live Tracker" subtitle="Loading your active ticket…" showQr={false} />
          <main className="flex-1 overflow-y-auto px-4 sm:px-6 max-w-7xl mx-auto w-full">
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-on-surface-variant">Syncing with the server…</p>
            </div>
          </main>
        </div>
      )
    }
    return (
      <div className="flex flex-1 flex-col bg-background pb-24 md:pb-0">
        <Header title="Live Tracker" subtitle="Track your queue position" showQr={false} />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 max-w-7xl mx-auto w-full">
          <div className="flex flex-col items-center gap-3 py-12">
            <Radio className="h-12 w-12 text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">No active token to track</p>
            <p className="text-xs text-on-surface-variant">Join a queue first to see live tracking</p>
            <button
              onClick={() => navigate('branch-checkin')}
              className="mt-4 px-6 py-3 bg-primary-container text-on-primary font-bold rounded-2xl hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Check-in to Branch
            </button>
          </div>
        </main>

        {/* Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pt-2 pb-6 h-20 backdrop-blur-lg border-t border-white/5 bg-surface-container-low/95 shadow-lg">
          <button onClick={() => navigate('dashboard')} className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90">
            <Home className="h-5 w-5" />
            <span className="mt-1 text-xs">Home</span>
          </button>
          <button onClick={() => navigate('my-tickets')} className="flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-full px-5 py-1.5 transition-all active:scale-90">
            <Ticket className="h-5 w-5" />
            <span className="mt-1 text-xs">Tickets</span>
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

  const servingTokens = livePositions.filter(p => p.status === 'serving')
  const waitingTokens = livePositions.filter(p => p.status === 'waiting' || p.status === 'you')

  return (
    <div className="flex flex-1 flex-col bg-background pb-24 md:pb-0">
      <Header title="Live Tracker" subtitle={activeToken.queueName || 'Queue position'} showQr={false} />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-16 max-w-7xl mx-auto w-full pt-4">
        {/* Live Status Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              <span className="text-secondary text-xs font-medium tracking-wider uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>Live Session Active</span>
            </div>
            <h2 className="text-on-surface" style={{ fontFamily: 'var(--font-plus-jakarta)', fontSize: 'clamp(24px, 4vw, 32px)', lineHeight: 1.2, fontWeight: 800 }}>
              {activeToken.queueName || 'Queue Tracker'}
            </h2>
            <p className="text-on-surface-variant mt-1">Ticket #{activeToken.tokenNumber}</p>
          </div>
          <div className="flex items-center gap-4 bg-surface-container-high rounded-full px-4 py-2 border border-white/5">
            <Clock className="h-4 w-4 text-secondary" />
            <p className="text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>
              Est. wait: <span className="text-secondary">{formatWaitTime(estimatedWaitSeconds)}</span>
            </p>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-6">
          {/* Main Tracker Card */}
          <section className="md:col-span-8 flex flex-col gap-6">
            <div className="glass-panel rounded-3xl p-6 md:p-10 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[400px]" style={{ boxShadow: '0 0 20px rgba(79, 70, 229, 0.15)' }}>
              {/* Background Decor */}
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 blur-[100px] rounded-full"></div>
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-secondary/10 blur-[100px] rounded-full"></div>

              <p className="text-on-surface-variant mb-4 uppercase tracking-[0.2em] text-xs font-medium" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.2em' }}>Your Position</p>

              <div className="relative mb-8">
                {/* Pulsing Progress Ring */}
                <div className="w-48 h-48 md:w-64 md:h-64 rounded-full border-4 border-primary/20 flex items-center justify-center relative">
                  <div className="absolute inset-0 border-4 border-secondary border-t-transparent rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
                  <motion.span
                    key={currentPosition}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-[80px] md:text-[120px] font-extrabold text-primary leading-none"
                    style={{ fontFamily: 'var(--font-plus-jakarta)' }}
                  >
                    {currentPosition}
                  </motion.span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 mb-8">
                <p className="text-on-surface" style={{ fontFamily: 'var(--font-plus-jakarta)', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>
                  {peopleAhead} {peopleAhead === 1 ? 'person' : 'people'} ahead of you
                </p>
                <p className="text-on-surface-variant max-w-xs text-sm" style={{ lineHeight: 1.5 }}>
                  We&apos;ll notify you when you are next. Please stay within the facility vicinity.
                </p>
              </div>

              {/* Notify Toggle */}
              <div className="flex items-center justify-between w-full max-w-sm bg-surface-container-highest/40 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-secondary" />
                  <div className="text-left">
                    <p className="font-bold text-sm text-on-surface">Smart Notifications</p>
                    <p className="text-xs text-on-surface-variant">Alert me when I&apos;m #{Math.max(1, currentPosition - 1)} in line</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationsEnabled}
                    onChange={(e) => setNotificationsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
                </label>
              </div>
            </div>

            {/* Next Up Section */}
            <div className="glass-panel rounded-3xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-on-surface flex items-center gap-2" style={{ fontFamily: 'var(--font-plus-jakarta)', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>
                  <ListOrdered className="h-5 w-5 text-primary" />
                  Next Up
                </h3>
                <span className="text-xs text-on-surface-variant">Last updated just now</span>
              </div>
              <div className="space-y-3">
                {/* Currently Serving */}
                {servingTokens.slice(0, 1).map((pos) => (
                  <div key={pos.tokenId} className="flex items-center justify-between p-4 rounded-2xl bg-secondary/10 border border-secondary/20 relative overflow-hidden">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center text-secondary font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '14px', fontWeight: 700, letterSpacing: '0.05em' }}>
                        {pos.tokenNumber}
                      </div>
                      <div>
                        <p className="font-bold text-on-surface">Now Serving</p>
                        <p className="text-xs text-on-surface-variant">Counter 3 &bull; Lobby A</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-secondary text-on-secondary text-xs font-bold rounded-full">ACTIVE</span>
                  </div>
                ))}

                {/* Waiting List */}
                {waitingTokens.filter(p => p.status !== 'you').slice(0, 2).map((pos, i) => (
                  <div key={pos.tokenId} className={`flex items-center justify-between p-4 rounded-2xl bg-surface-variant/20 border border-white/5 transition-all hover:border-white/10 ${i === 1 ? 'opacity-80' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '14px', fontWeight: 700, letterSpacing: '0.05em' }}>
                        {pos.tokenNumber}
                      </div>
                      <div>
                        <p className="font-bold text-on-surface">In Line</p>
                        <p className="text-xs text-on-surface-variant">Expected in {formatWaitTime(pos.estimatedWait)}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Your position in line */}
                {currentPosition > 1 && (
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/10 border border-primary/20 relative overflow-hidden">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '14px', fontWeight: 700, letterSpacing: '0.05em' }}>
                        {activeToken.tokenNumber}
                      </div>
                      <div>
                        <p className="font-bold text-primary">You (Position #{currentPosition})</p>
                        <p className="text-xs text-on-surface-variant">{formatWaitTime(estimatedWaitSeconds)} wait</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-primary/20 text-primary text-xs font-bold rounded-full">YOU</span>
                  </div>
                )}

                {servingTokens.length === 0 && waitingTokens.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-sm text-on-surface-variant">
                    No active positions in queue
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Sidebar Info Section */}
          <aside className="md:col-span-4 flex flex-col gap-6">
            {/* Service Details Card */}
            <div className="glass-panel rounded-3xl overflow-hidden">
              <div className="p-6">
                <h4 className="font-bold mb-4 text-on-surface">Service Details</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Queue Name</span>
                    <span className="text-on-surface">{activeToken.queueName || 'General'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Token Number</span>
                    <span className="text-primary font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.05em' }}>{activeToken.tokenNumber}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Position</span>
                    <span className="text-on-surface">#{currentPosition}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Check-in Time</span>
                    <span className="text-on-surface">
                      {new Date(activeToken.createdAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-white/5 pt-3">
                    <span className="text-on-surface-variant">Status</span>
                    <span className={`font-bold ${activeToken.status === 'WAITING' ? 'text-amber-400' : activeToken.status === 'CALLED' ? 'text-primary' : 'text-emerald-400'}`}>
                      {activeToken.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Card */}
            <div className="glass-panel rounded-3xl p-6 flex flex-col gap-4">
              <button
                onClick={() => navigate('token-display')}
                className="w-full py-4 bg-primary-container text-on-primary font-bold rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                style={{ boxShadow: '0 0 20px rgba(79, 70, 229, 0.15)' }}
              >
                <QrCode className="h-5 w-5" />
                View Digital Ticket
              </button>
              <button
                onClick={handleLeaveQueue}
                disabled={leaving}
                className="w-full py-4 border border-error/30 text-error font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-error/5 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <LogOut className="h-5 w-5" />
                {leaving ? 'Leaving...' : 'Leave Queue'}
              </button>
              <p className="text-[10px] text-center text-on-surface-variant px-4">Leaving the queue is permanent. You will lose your spot and must re-register if you change your mind.</p>
            </div>

            {/* Support Card */}
            <div className="bg-surface-container-high/50 rounded-3xl p-6 border border-white/5">
              <p className="font-bold mb-1 text-on-surface">Need help?</p>
              <p className="text-xs text-on-surface-variant mb-4">Chat with the facility coordinator directly from the app.</p>
              <button className="flex items-center gap-2 text-secondary text-sm font-bold hover:underline">
                Open Support Chat
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </aside>
        </div>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pt-2 pb-6 h-20 backdrop-blur-lg border-t border-white/5 bg-surface-container-low/95 shadow-lg">
        <button onClick={() => navigate('dashboard')} className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90">
          <Home className="h-5 w-5" />
          <span className="mt-1 text-xs">Home</span>
        </button>
        <button onClick={() => navigate('my-tickets')} className="flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-full px-5 py-1.5 transition-all active:scale-90">
          <Ticket className="h-5 w-5" />
          <span className="mt-1 text-xs">Tickets</span>
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

      {/* Success Toast */}
      <div className={`fixed bottom-24 right-4 md:bottom-8 md:right-8 bg-surface-container-highest border border-primary/20 p-4 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] transition-transform duration-500 ${showToast ? 'translate-y-0' : 'translate-y-32'}`}>
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-bold text-on-surface">{toastMessage.title}</p>
          <p className="text-xs text-on-surface-variant">{toastMessage.subtitle}</p>
        </div>
      </div>
    </div>
  )
}
