'use client'

import { motion } from 'framer-motion'
import { Clock, ListOrdered, ArrowRight, CheckCircle2, Bell, Timer } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Header } from './header'
import { Button } from '@/components/ui/button'

function formatWaitTime(seconds: number | null): string {
  if (!seconds) return '--'
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${hrs}h ${remainMins}m`
}

export function TokenDisplayScreen() {
  const { selectedToken, navigate, queue } = useAppStore()
  // Note: selectedToken might be from userTokens or a freshly joined token

  const token = selectedToken

  if (!token) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#0F172A]">
        <p className="text-sm text-slate-400">No token selected</p>
        <Button onClick={() => navigate('dashboard')} className="mt-4 bg-[#4F46E5] text-white">
          Back to Dashboard
        </Button>
      </div>
    )
  }

  const isCalled = token.status === 'CALLED'
  const isServing = token.status === 'SERVING'
  const isWaiting = token.status === 'WAITING'

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
      <Header title="Your Token" subtitle={token.queueName || 'Queue'} showNotifications={true} showQr={false} />

      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Token Card */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative overflow-hidden rounded-3xl border border-slate-800/50 bg-gradient-to-b from-[#111827] to-[#0F172A] p-8 text-center shadow-2xl"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4F46E5] blur-[80px]" />
              <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-[#06B6D4] blur-[60px]" />
            </div>

            <div className="relative z-10">
              {/* Status badge */}
              <motion.div
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    isCalled
                      ? 'bg-[#4F46E5]/20 text-[#4F46E5]'
                      : isServing
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {isCalled && <Bell className="h-3 w-3" />}
                  {isServing && <CheckCircle2 className="h-3 w-3" />}
                  {isWaiting && <Clock className="h-3 w-3" />}
                  {isCalled ? 'It\'s Your Turn!' : isServing ? 'Being Served' : 'Waiting'}
                </span>
              </motion.div>

              {/* Token Number */}
              <motion.div
                className="mt-6"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 400 }}
              >
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Token Number</p>
                <h2 className="mt-2 text-6xl font-black text-white tracking-tight">
                  {token.tokenNumber}
                </h2>
              </motion.div>

              {/* Position & Wait */}
              <motion.div
                className="mt-6 flex items-center justify-center gap-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/50">
                    <ListOrdered className="h-5 w-5 text-[#4F46E5]" />
                  </div>
                  <p className="mt-2 text-lg font-bold text-white">
                    #{token.position || token.sequenceNum}
                  </p>
                  <p className="text-[10px] text-slate-500">Position</p>
                </div>
                <div className="h-8 w-px bg-slate-800" />
                <div className="flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/50">
                    <Timer className="h-5 w-5 text-[#06B6D4]" />
                  </div>
                  <p className="mt-2 text-lg font-bold text-white">
                    {formatWaitTime(token.estimatedWait)}
                  </p>
                  <p className="text-[10px] text-slate-500">Est. Wait</p>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Live Tracking Link */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Button
              onClick={() => navigate('live-tracker')}
              className="h-12 w-full bg-gradient-to-r from-[#4F46E5] to-[#4338CA] text-sm font-semibold text-white shadow-lg shadow-[#4F46E5]/25"
            >
              Track Live Position
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>

          {/* Info cards */}
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-4">
              <p className="text-xs font-medium text-slate-400">
                You will receive a notification when it&apos;s your turn. Keep this screen open or enable push notifications to stay updated.
              </p>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
