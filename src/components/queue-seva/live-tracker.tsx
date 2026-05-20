'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Clock,
  ArrowRight,
  Radio,
  CheckCircle2,
} from 'lucide-react'
import { useAppStore, type AppToken } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Header } from './header'
import { Badge } from '@/components/ui/badge'

function formatWaitTime(seconds: number | null): string {
  if (!seconds) return '--'
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// Real live position from API data
interface LivePosition {
  position: number
  tokenNumber: string
  status: 'you' | 'serving' | 'waiting' | 'completed'
  estimatedWait: number
  tokenId: string
  userName: string
}

export function LiveTrackerScreen() {
  const { userTokens, selectedToken, navigate, refreshCounter } = useAppStore()
  const [livePositions, setLivePositions] = useState<LivePosition[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPosition, setCurrentPosition] = useState(0)
  const [totalInQueue, setTotalInQueue] = useState(0)

  const activeToken: AppToken | null = selectedToken || userTokens.find((t) => ['WAITING', 'CALLED'].includes(t.status)) || null

  const loadRealData = useCallback(async () => {
    if (!activeToken) {
      setLoading(false)
      return
    }

    try {
      // Fetch real tokens for this queue
      const tokensRes = await apiClient.getTokens({ queueId: activeToken.queueId, pageSize: 50 })
      if (tokensRes.success && tokensRes.data) {
        const items = (tokensRes.data as any).items || tokensRes.data
        const allTokens: any[] = Array.isArray(items) ? items : []

        // Build live positions from real data
        const positions: LivePosition[] = []
        let myPosition = 0
        let waitCount = 0

        for (const token of allTokens) {
          if (token.status === 'COMPLETED' || token.status === 'CANCELLED' || token.status === 'EXPIRED') continue

          waitCount++
          const isMe = token.id === activeToken.id
          const status: LivePosition['status'] =
            isMe ? 'you' :
            token.status === 'SERVING' ? 'serving' :
            token.status === 'CALLED' ? 'serving' :
            'waiting'

          if (status === 'waiting' && !isMe) {
            waitCount // counting position
          }

          if (isMe) {
            // Calculate my real position by counting WAITING tokens with lower sequence numbers
            myPosition = allTokens.filter(
              (t: any) => t.status === 'WAITING' && t.sequenceNum <= token.sequenceNum
            ).length
          }

          positions.push({
            position: positions.length + 1,
            tokenNumber: token.tokenNumber,
            status,
            estimatedWait: token.estimatedWait || 0,
            tokenId: token.id,
            userName: token.user?.name || 'User',
          })
        }

        setLivePositions(positions)
        setCurrentPosition(myPosition || activeToken.position || activeToken.sequenceNum || 0)
        setTotalInQueue(positions.filter(p => p.status !== 'completed').length)
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

  // Refresh when refreshCounter changes
  useEffect(() => {
    if (refreshCounter > 0) {
      loadRealData()
    }
  }, [refreshCounter])

  // Faster polling for live position updates (3 seconds)
  useEffect(() => {
    if (!activeToken) return
    const interval = setInterval(() => {
      loadRealData()
    }, 3000)
    return () => clearInterval(interval)
  }, [activeToken])

  // Also refresh the specific token to get updated position
  const [tokenDetail, setTokenDetail] = useState<any>(null)
  useEffect(() => {
    if (!activeToken) return
    const interval = setInterval(async () => {
      try {
        const result = await apiClient.getToken(activeToken.id)
        if (result.success && result.data) {
          setTokenDetail(result.data)
          if ((result.data as any).currentPosition) {
            setCurrentPosition((result.data as any).currentPosition)
          }
          // If token status changed to CALLED, show notification
          if ((result.data as any).status === 'CALLED' && activeToken.status === 'WAITING') {
            // Update the selected token
            useAppStore.getState().setSelectedToken({
              ...activeToken,
              status: 'CALLED',
              calledAt: (result.data as any).calledAt,
            })
          }
        }
      } catch (error) {
        console.error('Failed to refresh token:', error)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [activeToken])

  const basePosition = activeToken?.position ?? activeToken?.sequenceNum ?? 0
  const progressPercent = basePosition > 0
    ? Math.round(((basePosition - currentPosition + 1) / basePosition) * 100)
    : 0

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title="Live Tracker" subtitle="Real-time queue position" showQr={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-md space-y-5">
          {/* Live indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2"
          >
            <motion.div
              className="h-2 w-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Live</span>
          </motion.div>

          {activeToken ? (
            <>
              {/* Position Card */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative overflow-hidden rounded-3xl border border-slate-800/50 bg-gradient-to-b from-[#111827] to-[#0F172A] p-8 text-center"
              >
                <div className="absolute left-1/2 top-0 h-32 w-32 -translate-x-1/2 rounded-full bg-[#4F46E5]/20 blur-[60px]" />
                <div className="relative z-10">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Your Position</p>
                  <motion.h2
                    key={currentPosition}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mt-3 text-7xl font-black text-white"
                  >
                    {currentPosition}
                  </motion.h2>
                  <p className="mt-2 text-sm text-slate-400">
                    of {totalInQueue} in queue
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-[#4F46E5]">
                      <Clock className="h-4 w-4" />
                      <span className="font-semibold">{formatWaitTime(activeToken.estimatedWait || currentPosition * 300)}</span>
                      <span className="text-slate-500">wait</span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Progress bar */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-4"
              >
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Progress</span>
                  <span className="text-[#4F46E5] font-semibold">{Math.min(progressPercent, 100)}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#4F46E5] to-[#06B6D4]"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(progressPercent, 100)}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-slate-600">
                  <span>Joined</span>
                  <span>Being Served</span>
                </div>
              </motion.div>

              {/* Live Position List */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h3 className="mb-3 text-sm font-semibold text-white">Queue Positions</h3>
                <div className="space-y-2">
                  <AnimatePresence>
                    {livePositions.slice(0, 15).map((pos) => (
                      <motion.div
                        key={pos.tokenId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className={`flex items-center gap-3 rounded-xl p-3 ${
                          pos.status === 'you'
                            ? 'border border-[#4F46E5]/30 bg-[#4F46E5]/10'
                            : 'border border-slate-800/30 bg-slate-900/30'
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                            pos.status === 'serving'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : pos.status === 'you'
                                ? 'bg-[#4F46E5]/20 text-[#4F46E5]'
                                : 'bg-slate-800/50 text-slate-500'
                          }`}
                        >
                          {pos.status === 'serving' ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            pos.position
                          )}
                        </div>
                        <div className="flex-1">
                          <p
                            className={`text-sm font-medium ${
                              pos.status === 'you' ? 'text-[#4F46E5]' : 'text-slate-400'
                            }`}
                          >
                            {pos.tokenNumber}
                            {pos.status === 'you' && ' (You)'}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            pos.status === 'serving'
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                              : pos.status === 'you'
                                ? 'border-[#4F46E5]/20 bg-[#4F46E5]/10 text-[#4F46E5]'
                                : 'border-slate-800/50 bg-slate-900/30 text-slate-500'
                          }`}
                        >
                          {pos.status === 'serving' ? 'Serving' : pos.status === 'you' ? 'Your Turn' : `~${Math.round(pos.estimatedWait / 60)}m`}
                        </Badge>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12">
              <Radio className="h-12 w-12 text-slate-700" />
              <p className="text-sm text-slate-400">No active token to track</p>
              <p className="text-xs text-slate-600">Join a queue first to see live tracking</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
