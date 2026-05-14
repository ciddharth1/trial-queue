'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Clock,
  ArrowRight,
  Radio,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Minus,
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

// Simulated live positions for demo
interface LivePosition {
  position: number
  tokenNumber: string
  status: string
  estimatedWait: number
}

function generateLivePositions(tokenPosition: number, totalInQueue: number): LivePosition[] {
  const positions: LivePosition[] = []
  for (let i = 1; i <= Math.min(totalInQueue, 10); i++) {
    const status = i < tokenPosition ? 'serving' : i === tokenPosition ? 'you' : 'waiting'
    positions.push({
      position: i,
      tokenNumber: `A-${String(i).padStart(3, '0')}`,
      status,
      estimatedWait: (i - 1) * 5,
    })
  }
  return positions
}

export function LiveTrackerScreen() {
  const { userTokens, selectedToken, navigate } = useAppStore()
  const [simulatedPosition, setSimulatedPosition] = useState<number | null>(null)

  const activeToken: AppToken | null = selectedToken || userTokens.find((t) => ['WAITING', 'CALLED'].includes(t.status)) || null
  const basePosition = activeToken?.position || activeToken?.sequenceNum || 0
  const currentPosition = simulatedPosition ?? basePosition
  const totalInQueue = Math.max(basePosition + 5, 15)

  // Simulate position updates
  useEffect(() => {
    if (!activeToken || activeToken.status !== 'WAITING') return
    const interval = setInterval(() => {
      setSimulatedPosition((prev) => {
        const current = prev ?? basePosition
        return Math.max(1, current - 1)
      })
    }, 8000)
    return () => clearInterval(interval)
  }, [activeToken])

  const livePositions = activeToken ? generateLivePositions(currentPosition, totalInQueue) : []
  const progressPercent = activeToken
    ? Math.round(((activeToken.position || activeToken.sequenceNum - currentPosition + 1) / (activeToken.position || activeToken.sequenceNum)) * 100)
    : 0

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
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
                      <span className="font-semibold">{formatWaitTime(currentPosition * 300)}</span>
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
                    {livePositions.map((pos) => (
                      <motion.div
                        key={pos.position}
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
                          {pos.status === 'serving' ? 'Serving' : pos.status === 'you' ? 'Your Turn' : `~${pos.estimatedWait}m`}
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
