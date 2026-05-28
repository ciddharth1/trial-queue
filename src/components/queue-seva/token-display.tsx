'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Clock, ListOrdered, ArrowRight, CheckCircle2, Bell, Timer, LogOut, Loader2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { emitRefresh } from '@/hooks/use-realtime'
import { socketManager } from '@/lib/socket'
import { Header } from './header'
import { Button } from '@/components/ui/button'
import { TokenQrCard } from './token-qr-card'
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

export function TokenDisplayScreen() {
  const { selectedToken, navigate, selectedQueue, setUserTokens, userTokens, triggerRefresh, refreshCounter } = useAppStore()
  const [leaving, setLeaving] = useState(false)
  const [liveToken, setLiveToken] = useState(selectedToken)

  // Auto-refresh token status to detect when admin calls/completes the token
  const refreshTokenStatus = useCallback(async () => {
    if (!selectedToken?.id) return
    try {
      const result = await apiClient.getToken(selectedToken.id)
      if (result.success && result.data) {
        const updated = result.data as any
        const newToken = {
          ...selectedToken,
          status: updated.status || selectedToken.status,
          position: updated.currentPosition || selectedToken.position,
          calledAt: updated.calledAt || selectedToken.calledAt,
          estimatedWait: updated.estimatedWait ?? selectedToken.estimatedWait,
        }
        setLiveToken(newToken)
        // Update in user tokens list too
        const store = useAppStore.getState()
        store.setUserTokens(store.userTokens.map(t => t.id === selectedToken.id ? newToken : t))
        if (selectedToken.status !== updated.status) {
          useAppStore.getState().setSelectedToken(newToken)
          // Show toast notification for status change
          if (updated.status === 'CALLED') {
            toast.success('Your token has been called! Please proceed to the counter.')
          } else if (updated.status === 'SERVING') {
            toast.info('Your token is now being served.')
          } else if (updated.status === 'COMPLETED') {
            toast.success('Your service has been completed!')
          }
        }
      }
    } catch (error) {
      // Silently ignore refresh errors
    }
  }, [selectedToken])

  // Poll token status every 3 seconds for real-time updates
  useEffect(() => {
    if (!selectedToken?.id) return
    const interval = setInterval(refreshTokenStatus, 3000)
    return () => clearInterval(interval)
  }, [selectedToken?.id, refreshTokenStatus])

  // Also refresh on refreshCounter change
  useEffect(() => {
    if (refreshCounter > 0) {
      refreshTokenStatus()
    }
  }, [refreshCounter, refreshTokenStatus])

  const token = liveToken

  const handleLeaveQueue = async () => {
    if (!token) return
    setLeaving(true)
    try {
      const result = await apiClient.leaveQueue(token.queueId)
      if (result.success) {
        toast.success('You have left the queue')
        // Remove this token from user tokens
        setUserTokens(userTokens.filter(t => t.id !== token.id))
        // Broadcast the change to ALL tabs (admin will see it immediately)
        emitRefresh('queue-update')
        emitRefresh('token-update')
        // Emit Socket.io event for real-time cross-browser notification
        socketManager.emitTokenExpired({
          queueId: token.queueId,
          tokenId: token.id,
          tokenNumber: token.tokenNumber,
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

  if (!token) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background">
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
  const isCompleted = token.status === 'COMPLETED'

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title="Your Token" subtitle={token.queueName || 'Queue'} showNotifications={true} showQr={false} />

      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Token Card */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative overflow-hidden rounded-3xl border border-slate-800/50 bg-gradient-to-b from-[#111827] to-[#0F172A] p-8 text-center shadow-2xl"
          ><div className="absolute inset-0 opacity-30">
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
                        : isCompleted
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {isCalled && <Bell className="h-3 w-3" />}
                  {isServing && <CheckCircle2 className="h-3 w-3" />}
                  {isWaiting && <Clock className="h-3 w-3" />}
                  {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                  {isCalled ? 'It\'s Your Turn!' : isServing ? 'Being Served' : isCompleted ? 'Completed' : 'Waiting'}
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
                    #{token.position ?? token.sequenceNum}
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

          {/* Secure single-use QR for in-person validation */}
          {(isWaiting || isCalled || isServing) && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <TokenQrCard
                tokenId={token.id}
                initialExpiresAt={token.expiresAt ?? null}
                consumed={isServing && !!token.servedAt}
              />
              <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-500">
                Show this QR at the counter. It expires after first scan.
              </p>
            </motion.div>
          )}

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

          {/* Leave Queue Button */}
          {(isWaiting || isCalled) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
            >
              <Button
                onClick={handleLeaveQueue}
                disabled={leaving}
                variant="outline"
                className="h-11 w-full border-red-500/30 bg-red-500/5 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-300"
              >
                {leaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                {leaving ? 'Leaving Queue...' : 'Leave Queue'}
              </Button>
            </motion.div>
          )}

          {/* Info cards */}
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            {isCompleted ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm font-semibold text-emerald-400">Service Completed!</p>
                <p className="text-xs text-slate-500 mt-1">Your service has been completed. Thank you for using QueueSeva!</p>
                <Button
                  onClick={() => navigate('dashboard')}
                  className="mt-3 bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                  size="sm"
                >
                  Back to Dashboard
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-4">
                <p className="text-xs font-medium text-slate-400">
                  You will receive a notification when it&apos;s your turn. Keep this screen open or enable push notifications to stay updated.
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  )
}
