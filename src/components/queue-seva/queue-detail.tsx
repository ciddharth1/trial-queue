'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Users,
  Clock,
  Plus,
  Share2,
  QrCode,
  Play,
  Pause,
  Square,
  ListOrdered,
  Timer,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { useAppStore, type AppQueue, type AppToken } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { emitRefresh, useQueueRoom } from '@/hooks/use-realtime'
import { socketManager } from '@/lib/socket'
import { Header } from './header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

export function QueueDetailScreen() {
  const { selectedQueue, navigate, goBack, user, setUserTokens, setSelectedToken, refreshCounter } = useAppStore()
  // Join Socket.io room for this queue to receive real-time updates
  useQueueRoom(selectedQueue?.id)

  const [queue, setQueue] = useState<AppQueue | null>(selectedQueue)
  const [tokens, setTokens] = useState<AppToken[]>([])
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)

  const loadQueueDetail = useCallback(async () => {
    if (!selectedQueue?.id) return
    setLoading(true)
    try {
      const [queueRes, tokensRes] = await Promise.all([
        apiClient.getQueue(selectedQueue.id),
        apiClient.getTokens({ queueId: selectedQueue.id }),
      ])
      if (queueRes.success && queueRes.data) setQueue(queueRes.data as AppQueue)
      if (tokensRes.success && tokensRes.data) {
        const tokenItems = (tokensRes.data as any).items || tokensRes.data
        setTokens(Array.isArray(tokenItems) ? tokenItems : [])
      }
    } catch (error) {
      console.error('Failed to load queue detail:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedQueue?.id])

  useEffect(() => {
    if (selectedQueue?.id) {
      loadQueueDetail()
    }
  }, [selectedQueue?.id, loadQueueDetail])

  // Refresh when refreshCounter changes (other users/admins made changes)
  useEffect(() => {
    if (refreshCounter > 0 && selectedQueue?.id) {
      loadQueueDetail()
    }
  }, [refreshCounter])

  // Faster polling for real-time updates
  useEffect(() => {
    if (!selectedQueue?.id) return
    const interval = setInterval(() => {
      loadQueueDetail()
    }, 4000)
    return () => clearInterval(interval)
  }, [selectedQueue?.id])

  const handleJoinQueue = async () => {
    if (!queue || !user) return
    setJoining(true)
    try {
      const result = await apiClient.joinQueue(queue.id)
      if (result.success && result.data) {
        const token = result.data as AppToken
        token.queueName = queue.name
        setSelectedToken(token)
        setUserTokens([...useAppStore.getState().userTokens, token])
        // Refresh queue detail to show updated currentLength
        await loadQueueDetail()
        // Broadcast the change to ALL tabs (admin will see it immediately)
        emitRefresh('queue-update')
        emitRefresh('token-update')
        // Emit Socket.io event for real-time cross-browser notification
        socketManager.emitTokenCreated({
          queueId: queue.id,
          tokenId: token.id,
          tokenNumber: token.tokenNumber,
          userId: user!.id,
          position: token.position || token.sequenceNum,
          estimatedWaitMinutes: token.estimatedWait ? Math.ceil(token.estimatedWait / 60) : undefined,
        })
        toast.success(`You joined "${queue.name}"! Token: ${token.tokenNumber}`)
        navigate('live-tracker')
      } else {
        toast.error((result as any).error || 'Failed to join queue')
      }
    } catch (error) {
      console.error('Failed to join queue:', error)
      toast.error('Failed to join queue')
    } finally {
      setJoining(false)
    }
  }

  if (!queue) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background">
        <AlertCircle className="mb-4 h-12 w-12 text-slate-600" />
        <p className="text-sm text-slate-400">No queue selected</p>
        <Button onClick={() => navigate('queues')} className="mt-4 bg-[#4F46E5] text-white">
          Browse Queues
        </Button>
      </div>
    )
  }

  const occupancyPercent = queue.maxCapacity > 0 ? Math.round((queue.currentLength / queue.maxCapacity) * 100) : 0
  const waitingTokens = tokens.filter((t) => t.status === 'WAITING')
  const servingTokens = tokens.filter((t) => t.status === 'SERVING' || t.status === 'CALLED')
  const completedTokens = tokens.filter((t) => t.status === 'COMPLETED')

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title={queue.name} subtitle={`Queue ${queue.prefix}`} showQr={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-lg space-y-5">
          {/* Queue Status Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F46E5] to-[#4338CA] shadow-lg shadow-[#4F46E5]/20">
                  <span className="text-2xl font-bold text-white">{queue.prefix}</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{queue.name}</h2>
                  <p className="text-xs text-slate-500">{queue.description || 'General service queue'}</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  queue.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : queue.status === 'PAUSED'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                }
              >
                {queue.status}
              </Badge>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-800/30 p-3 text-center">
                <Users className="mx-auto mb-1.5 h-4 w-4 text-[#4F46E5]" />
                <p className="text-xl font-bold text-white">{queue.currentLength}</p>
                <p className="text-[10px] text-slate-500">In Queue</p>
              </div>
              <div className="rounded-xl bg-slate-800/30 p-3 text-center">
                <Timer className="mx-auto mb-1.5 h-4 w-4 text-[#06B6D4]" />
                <p className="text-xl font-bold text-white">
                  {Math.round((queue.avgServiceTime * queue.currentLength) / 60)}
                </p>
                <p className="text-[10px] text-slate-500">Min Wait</p>
              </div>
              <div className="rounded-xl bg-slate-800/30 p-3 text-center">
                <CheckCircle2 className="mx-auto mb-1.5 h-4 w-4 text-emerald-400" />
                <p className="text-xl font-bold text-white">{completedTokens.length}</p>
                <p className="text-[10px] text-slate-500">Served</p>
              </div>
            </div>

            {/* Capacity bar */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Queue Capacity</span>
                <span className="text-slate-400">
                  {queue.currentLength}/{queue.maxCapacity} ({occupancyPercent}%)
                </span>
              </div>
              <Progress value={occupancyPercent} className="h-2 bg-slate-800 [&>div]:bg-gradient-to-r [&>div]:from-[#4F46E5] [&>div]:to-[#06B6D4]" />
            </div>
          </motion.div>

          {/* Join Button */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Button
              onClick={handleJoinQueue}
              disabled={joining || queue.status === 'CLOSED' || queue.currentLength >= queue.maxCapacity}
              className="h-12 w-full bg-gradient-to-r from-[#4F46E5] to-[#4338CA] text-sm font-semibold text-white shadow-lg shadow-[#4F46E5]/25 hover:shadow-xl disabled:opacity-50"
            >
              {joining ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                />
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Join This Queue
                </>
              )}
            </Button>
          </motion.div>

          {/* Queue Breakdown */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="mb-3 text-sm font-semibold text-white">Queue Breakdown</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-amber-500/5 border border-amber-500/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <span className="text-sm text-slate-300">Waiting</span>
                </div>
                <span className="text-sm font-bold text-amber-400">{waitingTokens.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#4F46E5]/5 border border-[#4F46E5]/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-[#4F46E5]" />
                  <span className="text-sm text-slate-300">Being Served</span>
                </div>
                <span className="text-sm font-bold text-[#4F46E5]">{servingTokens.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-emerald-500/5 border border-emerald-500/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-slate-300">Completed</span>
                </div>
                <span className="text-sm font-bold text-emerald-400">{completedTokens.length}</span>
              </div>
            </div>
          </motion.div>

          {/* QR Code section */}
          {queue.qrCode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800/50 bg-slate-900/30 p-6"
            >
              <QrCode className="h-8 w-8 text-slate-500" />
              <p className="text-xs text-slate-500">Share this queue&apos;s QR code for quick joining</p>
              <Button variant="outline" className="border-slate-700 bg-slate-800/50 text-xs text-slate-300">
                <Share2 className="mr-1 h-3.5 w-3.5" />
                Share QR Code
              </Button>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  )
}
