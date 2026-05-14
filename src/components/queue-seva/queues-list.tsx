'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, ListOrdered, Users, Clock, CheckCircle2, Filter } from 'lucide-react'
import { useAppStore, type AppQueue } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Header } from './header'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function QueuesListScreen() {
  const { navigate, setSelectedQueue, queues, setQueues } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadQueues()
  }, [])

  const loadQueues = async () => {
    setLoading(true)
    try {
      const result = await apiClient.getQueues(
        statusFilter !== 'all' ? { status: statusFilter } : undefined
      )
      if (result.success && result.data) {
        setQueues((result.data as any).items || result.data as unknown as AppQueue[] || [])
      }
    } catch (error) {
      console.error('Failed to load queues:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredQueues = queues.filter(
    (q) =>
      q.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.prefix.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
      <Header title="All Queues" subtitle={`${queues.length} queues available`} showQr={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Search & Filter */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search queues by name or prefix..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 border-slate-800 bg-slate-900/80 pl-10 text-white placeholder:text-slate-600 focus:border-[#4F46E5]"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'ACTIVE', 'PAUSED', 'CLOSED'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    statusFilter === status
                      ? 'bg-[#4F46E5]/20 text-[#4F46E5]'
                      : 'bg-slate-800/30 text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                  }`}
                >
                  {status === 'all' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Queue List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-800/50 bg-slate-900/30" />
              ))}
            </div>
          ) : filteredQueues.length > 0 ? (
            <div className="space-y-3">
              {filteredQueues.map((queue, i) => (
                <motion.button
                  key={queue.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => {
                    setSelectedQueue(queue)
                    navigate('queue-detail')
                  }}
                  className="w-full text-left rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-4 backdrop-blur-sm transition-all hover:border-[#4F46E5]/30 hover:shadow-lg hover:shadow-[#4F46E5]/5"
                >
                  <div className="flex items-center gap-4">
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
                      <p className="text-xs text-slate-500 truncate">{queue.description || 'General service queue'}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {queue.currentLength} in queue
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.round((queue.avgServiceTime * queue.currentLength) / 60)}m wait
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-16"
            >
              <ListOrdered className="h-12 w-12 text-slate-700" />
              <p className="text-sm text-slate-400">No queues found</p>
              <p className="text-xs text-slate-600">Try adjusting your search or filter</p>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  )
}
