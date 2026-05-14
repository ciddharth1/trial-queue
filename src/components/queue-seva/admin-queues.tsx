'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Play,
  Pause,
  Square,
  MoreVertical,
  Users,
  Clock,
  CheckCircle2,
  Settings,
  Trash2,
} from 'lucide-react'
import { useAppStore, type AppQueue } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Header } from './header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// Demo queues for admin
const demoQueues: (AppQueue & { waiting: number; serving: number; completed: number })[] = [
  { id: '1', name: 'General Service', prefix: 'A', status: 'ACTIVE', maxCapacity: 100, currentLength: 23, avgServiceTime: 300, serviceCenterId: '1', ownerId: 'admin', description: 'Main service queue', qrCode: null, waiting: 18, serving: 5, completed: 156 },
  { id: '2', name: 'Priority Counter', prefix: 'B', status: 'ACTIVE', maxCapacity: 50, currentLength: 8, avgServiceTime: 180, serviceCenterId: '1', ownerId: 'admin', description: 'Fast-track priority', qrCode: null, waiting: 5, serving: 3, completed: 89 },
  { id: '3', name: 'Billing & Payments', prefix: 'C', status: 'PAUSED', maxCapacity: 80, currentLength: 12, avgServiceTime: 420, serviceCenterId: '1', ownerId: 'admin', description: 'Billing inquiries', qrCode: null, waiting: 12, serving: 0, completed: 72 },
  { id: '4', name: 'VIP Service', prefix: 'D', status: 'ACTIVE', maxCapacity: 30, currentLength: 4, avgServiceTime: 120, serviceCenterId: '1', ownerId: 'admin', description: 'Premium VIP service', qrCode: null, waiting: 2, serving: 2, completed: 34 },
  { id: '5', name: 'Returns & Exchange', prefix: 'E', status: 'CLOSED', maxCapacity: 60, currentLength: 0, avgServiceTime: 540, serviceCenterId: '1', ownerId: 'admin', description: 'Product returns', qrCode: null, waiting: 0, serving: 0, completed: 48 },
]

export function AdminQueuesScreen() {
  const { navigate, setSelectedQueue, setQueues } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newQueue, setNewQueue] = useState({ name: '', prefix: '', maxCapacity: 100, description: '' })
  const [creating, setCreating] = useState(false)

  const filteredQueues = demoQueues.filter(
    (q) => q.name.toLowerCase().includes(searchQuery.toLowerCase()) || q.prefix.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreateQueue = async () => {
    if (!newQueue.name || !newQueue.prefix) return
    setCreating(true)
    try {
      const result = await apiClient.createQueue({
        name: newQueue.name,
        prefix: newQueue.prefix.toUpperCase(),
        maxCapacity: newQueue.maxCapacity,
        serviceCenterId: '1',
        description: newQueue.description,
      })
      if (result.success) {
        setShowCreate(false)
        setNewQueue({ name: '', prefix: '', maxCapacity: 100, description: '' })
      }
    } catch (error) {
      console.error('Failed to create queue:', error)
    } finally {
      setCreating(false)
    }
  }

  const statusActions: Record<string, { icon: any; label: string; color: string }[]> = {
    ACTIVE: [
      { icon: Pause, label: 'Pause', color: 'text-amber-400' },
      { icon: Square, label: 'Close', color: 'text-red-400' },
    ],
    PAUSED: [
      { icon: Play, label: 'Resume', color: 'text-emerald-400' },
      { icon: Square, label: 'Close', color: 'text-red-400' },
    ],
    CLOSED: [
      { icon: Play, label: 'Reopen', color: 'text-emerald-400' },
    ],
  }

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
      <Header title="Queue Management" subtitle="Create and manage queues" showQr={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
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
            {filteredQueues.map((queue, i) => (
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
                        {queue.completed} served
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(statusActions[queue.status] || []).map((action) => (
                      <button
                        key={action.label}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-slate-800 ${action.color}`}
                        title={action.label}
                      >
                        <action.icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{action.label}</span>
                      </button>
                    ))}
                    <button
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                      title="Settings"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
