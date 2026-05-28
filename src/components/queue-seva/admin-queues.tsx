'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Play,
  Pause,
  Square,
  Users,
  Clock,
  CheckCircle2,
  Settings,
  Trash2,
  PhoneIncoming,
  CheckCircle,
  RefreshCw,
} from 'lucide-react'
import { useAppStore, type AppQueue } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { emitRefresh } from '@/hooks/use-realtime'
import { socketManager } from '@/lib/socket'
import { Header } from './header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export function AdminQueuesScreen() {
  const { navigate, setSelectedQueue, setQueues, refreshCounter } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newQueue, setNewQueue] = useState({ name: '', prefix: '', maxCapacity: 100, description: '' })
  const [creating, setCreating] = useState(false)
  const [queuesList, setQueuesList] = useState<(AppQueue & { waiting?: number; serving?: number; completed?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [serviceCenterId, setServiceCenterId] = useState<string | null>(null)

  const loadServiceCenter = useCallback(async () => {
    try {
      const result = await apiClient.getServiceCenters()
      if (result.success && result.data) {
        const items = (result.data as any).items || result.data
        if (Array.isArray(items) && items.length > 0) {
          setServiceCenterId(items[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load service centers:', error)
    }
  }, [])

  const loadQueues = useCallback(async (opts?: { background?: boolean }) => {
    if (!opts?.background) setLoading(true)
    try {
      const result = await apiClient.getQueues()
      if (result.success && result.data) {
        const items = (result.data as any).items || result.data
        setQueuesList(Array.isArray(items) ? items : [])
        setQueues(Array.isArray(items) ? items : [])
      }
    } catch (error) {
      console.error('Failed to load queues:', error)
      toast.error('Failed to load queues')
    } finally {
      setLoading(false)
    }
  }, [setQueues])

  useEffect(() => {
    loadServiceCenter()
    loadQueues()
  }, [])

  // Background refresh on socket events.
  useEffect(() => {
    if (refreshCounter > 0) loadQueues({ background: true })
  }, [refreshCounter])

  const filteredQueues = queuesList.filter(
    (q) => q.name.toLowerCase().includes(searchQuery.toLowerCase()) || q.prefix.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreateQueue = async () => {
    if (!newQueue.name || !newQueue.prefix) return
    if (!serviceCenterId) {
      toast.error('No service center available. Please create one first.')
      return
    }
    setCreating(true)
    try {
      const result = await apiClient.createQueue({
        name: newQueue.name,
        prefix: newQueue.prefix.toUpperCase(),
        maxCapacity: newQueue.maxCapacity,
        serviceCenterId: serviceCenterId,
        description: newQueue.description,
      })
      if (result.success) {
        setShowCreate(false)
        setNewQueue({ name: '', prefix: '', maxCapacity: 100, description: '' })
        toast.success('Queue created successfully!')
        loadQueues()
        // Broadcast the change to all tabs and via Socket.io
        emitRefresh('queue-update')
        const createdQueueId = (result.data as any)?.id || ''
        socketManager.emitQueueUpdate({
          queueId: createdQueueId,
          organizationId: 'default',
          updateType: 'QUEUE_UPDATED',
        })
      } else {
        toast.error(result.error || 'Failed to create queue')
      }
    } catch (error) {
      console.error('Failed to create queue:', error)
      toast.error('Failed to create queue')
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (queueId: string, newStatus: string) => {
    try {
      const result = await apiClient.updateQueue(queueId, { status: newStatus })
      if (result.success) {
        toast.success(`Queue ${newStatus === 'ACTIVE' ? 'resumed' : newStatus === 'PAUSED' ? 'paused' : 'closed'} successfully!`)
        loadQueues()
        // Broadcast the change to all tabs and via Socket.io
        emitRefresh('queue-update')
        const updateType = newStatus === 'ACTIVE' ? 'QUEUE_RESUMED' : newStatus === 'PAUSED' ? 'QUEUE_PAUSED' : 'QUEUE_CLOSED'
        socketManager.emitQueueUpdate({
          queueId,
          organizationId: 'default',
          updateType,
        })
      } else {
        toast.error(result.error || 'Failed to update queue')
      }
    } catch (error) {
      console.error('Failed to update queue:', error)
      toast.error('Failed to update queue status')
    }
  }

  const handleCallNext = async (queueId: string) => {
    try {
      // Get the first WAITING token for this queue
      const tokensRes = await apiClient.getTokens({ queueId, status: 'WAITING', pageSize: 50 })
      if (tokensRes.success && tokensRes.data) {
        const items = (tokensRes.data as any).items || tokensRes.data
        const waitingTokens = Array.isArray(items) ? items : []
        if (waitingTokens.length === 0) {
          toast.info('No waiting tokens in this queue')
          return
        }
        // Call the first waiting token
        const nextToken = waitingTokens[0]
        const result = await apiClient.updateToken(nextToken.id, { status: 'CALLED' })
        if (result.success) {
          toast.success(`Token ${nextToken.tokenNumber} has been called!`)
          loadQueues()
          // Broadcast the change to all tabs (both admin and user) and via Socket.io
          emitRefresh('token-update')
          emitRefresh('queue-update')
          socketManager.emitTokenCalled({
            queueId,
            tokenId: nextToken.id,
            tokenNumber: nextToken.tokenNumber,
            counterId: 'counter-1',
            counterName: 'Counter 1',
            userId: nextToken.userId,
          })
        } else {
          toast.error(result.error || 'Failed to call next token')
        }
      }
    } catch (error) {
      console.error('Failed to call next token:', error)
      toast.error('Failed to call next token')
    }
  }

  const handleCompleteCurrent = async (queueId: string) => {
    try {
      // Get the first CALLED/SERVING token for this queue
      const tokensRes = await apiClient.getTokens({ queueId, pageSize: 50 })
      if (tokensRes.success && tokensRes.data) {
        const items = (tokensRes.data as any).items || tokensRes.data
        const allTokens = Array.isArray(items) ? items : []
        const activeToken = allTokens.find((t: any) => t.status === 'CALLED' || t.status === 'SERVING')
        if (!activeToken) {
          toast.info('No active token to complete')
          return
        }
        const result = await apiClient.updateToken(activeToken.id, { status: 'COMPLETED' })
        if (result.success) {
          toast.success(`Token ${activeToken.tokenNumber} marked as completed!`)
          loadQueues()
          // Broadcast the change to all tabs and via Socket.io
          emitRefresh('token-update')
          emitRefresh('queue-update')
          socketManager.emitTokenCompleted({
            queueId,
            tokenId: activeToken.id,
            tokenNumber: activeToken.tokenNumber,
            counterId: 'counter-1',
            counterName: 'Counter 1',
            userId: activeToken.userId,
          })
        } else {
          toast.error(result.error || 'Failed to complete token')
        }
      }
    } catch (error) {
      console.error('Failed to complete token:', error)
      toast.error('Failed to complete token')
    }
  }

  const statusActions: Record<string, { icon: any; label: string; color: string; newStatus: string }[]> = {
    ACTIVE: [
      { icon: Pause, label: 'Pause', color: 'text-amber-400', newStatus: 'PAUSED' },
      { icon: Square, label: 'Close', color: 'text-red-400', newStatus: 'CLOSED' },
    ],
    PAUSED: [
      { icon: Play, label: 'Resume', color: 'text-emerald-400', newStatus: 'ACTIVE' },
      { icon: Square, label: 'Close', color: 'text-red-400', newStatus: 'CLOSED' },
    ],
    CLOSED: [
      { icon: Play, label: 'Reopen', color: 'text-emerald-400', newStatus: 'ACTIVE' },
    ],
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title="Queue Management" subtitle="Create and manage queues" showQr={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {/* Live indicator */}
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <motion.div
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span>Live · Auto-refreshing every 4s</span>
          </div>

          {/* Search & Create */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search queues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 border-slate-800 bg-slate-900/80 pl-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5]"
              />
            </div>
            <Button
              onClick={() => setShowCreate(true)}
              className="h-11 bg-[#4F46E5] text-white hover:bg-[#4338CA]"
            >
              <Plus className="mr-1 h-4 w-4" />
              New Queue
            </Button>
          </motion.div>

          {/* Create Queue Dialog */}
          <AnimatePresence>
            {showCreate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-[#4F46E5]/20 bg-[#4F46E5]/5 p-5">
                  <h3 className="mb-4 text-sm font-semibold text-white">Create New Queue</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Queue Name</label>
                      <Input
                        placeholder="e.g., General Service"
                        value={newQueue.name}
                        onChange={(e) => setNewQueue({ ...newQueue, name: e.target.value })}
                        className="h-10 border-slate-700 bg-slate-900/80 text-white placeholder:text-slate-600 focus:border-[#4F46E5]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Token Prefix</label>
                      <Input
                        placeholder="e.g., A"
                        maxLength={2}
                        value={newQueue.prefix}
                        onChange={(e) => setNewQueue({ ...newQueue, prefix: e.target.value.toUpperCase() })}
                        className="h-10 border-slate-700 bg-slate-900/80 text-white placeholder:text-slate-600 focus:border-[#4F46E5]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Max Capacity</label>
                      <Input
                        type="number"
                        placeholder="100"
                        value={newQueue.maxCapacity}
                        onChange={(e) => setNewQueue({ ...newQueue, maxCapacity: parseInt(e.target.value) || 100 })}
                        className="h-10 border-slate-700 bg-slate-900/80 text-white placeholder:text-slate-600 focus:border-[#4F46E5]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Description</label>
                      <Input
                        placeholder="Optional description"
                        value={newQueue.description}
                        onChange={(e) => setNewQueue({ ...newQueue, description: e.target.value })}
                        className="h-10 border-slate-700 bg-slate-900/80 text-white placeholder:text-slate-600 focus:border-[#4F46E5]"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={handleCreateQueue}
                      disabled={creating || !newQueue.name || !newQueue.prefix}
                      className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                    >
                      {creating ? 'Creating...' : 'Create Queue'}
                    </Button>
                    <Button
                      onClick={() => setShowCreate(false)}
                      variant="outline"
                      className="border-slate-700 text-slate-400"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Queue List */}
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-800/50 bg-slate-900/30" />
                ))}
              </div>
            ) : filteredQueues.length > 0 ? (
              filteredQueues.map((queue, i) => (
                <motion.div
                  key={queue.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm transition-all hover:border-[#4F46E5]/20"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4F46E5]/10 text-lg font-bold text-[#4F46E5]">
                      {queue.prefix}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{queue.name}</h3>
                        <Badge
                          variant="outline"
                          className={
                            queue.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]'
                              : queue.status === 'PAUSED'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]'
                                : 'bg-red-500/10 text-red-400 border-red-500/20 text-[10px]'
                          }
                        >
                          {queue.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">{queue.description}</p>
                      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {queue.currentLength}/{queue.maxCapacity}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.round((queue.avgServiceTime * queue.currentLength) / 60)}m wait
                        </span>
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          {queue.waitingCount ?? queue.currentLength ?? 0} waiting
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {queue.status === 'ACTIVE' && (
                        <>
                          <button
                            onClick={() => handleCallNext(queue.id)}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-[#4F46E5] transition-colors hover:bg-[#4F46E5]/10"
                            title="Call Next Token"
                          >
                            <PhoneIncoming className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Call Next</span>
                          </button>
                          <button
                            onClick={() => handleCompleteCurrent(queue.id)}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10"
                            title="Complete Current Token"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Complete</span>
                          </button>
                        </>
                      )}
                      {(statusActions[queue.status] || []).map((action) => (
                        <button
                          key={action.label}
                          onClick={() => handleStatusChange(queue.id, action.newStatus)}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-slate-800 ${action.color}`}
                          title={action.label}
                        >
                          <action.icon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{action.label}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setSelectedQueue(queue)
                          navigate('queue-detail')
                        }}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        title="Settings"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-16"
              >
                <Users className="h-12 w-12 text-slate-700" />
                <p className="text-sm text-slate-400">No queues found</p>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
