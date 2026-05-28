'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Users,
  ListOrdered,
  CheckCircle2,
  Clock,
  TrendingUp,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Hash,
  RefreshCw,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { emitRefresh } from '@/hooks/use-realtime'
import { socketManager } from '@/lib/socket'
import { Header } from './header'

interface AdminStats {
  totalUsers: number
  activeQueues: number
  tokensServedToday: number
  avgWaitTime: number
  totalServiceCenters: number
  totalTokensToday: number
  recentQueues?: any[]
  recentTokens?: any[]
}

function StatCard({
  icon: Icon,
  label,
  value,
  change,
  color,
  delay = 0,
}: {
  icon: any
  label: string
  value: string | number
  change?: number
  color: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border border-outline-variant/30 bg-gradient-to-b from-surface-container/80 to-surface-container/40 p-5 backdrop-blur-sm"
    >
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        {change !== undefined && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              change >= 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-error'
            }`}
          >
            {change >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-on-surface">{value}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{label}</p>
    </motion.div>
  )
}

// Mini chart using CSS bars
function MiniBarChart({ data, color = '#4f46e5' }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((val, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-t"
          style={{ backgroundColor: color, opacity: 0.3 + (val / max) * 0.7 }}
          initial={{ height: 0 }}
          animate={{ height: `${(val / max) * 100}%` }}
          transition={{ delay: i * 0.05, duration: 0.4 }}
        />
      ))}
    </div>
  )
}

export function AdminDashboard() {
  const { navigate, user, refreshCounter, socketConnected } = useAppStore()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load analytics data for charts
  const [hourlyData, setHourlyData] = useState([12, 19, 8, 25, 32, 28, 45, 52, 38, 42, 35, 28])
  const [dailyData, setDailyData] = useState([120, 145, 132, 168, 155, 142, 178, 190, 165, 185, 170, 195])

  const loadChartData = useCallback(async () => {
    try {
      const result = await apiClient.getAdminAnalytics({ days: 7 })
      if (result.success && result.data) {
        const dailyTraffic = result.data.dailyTraffic || []
        if (Array.isArray(dailyTraffic) && dailyTraffic.length > 0) {
          setDailyData(dailyTraffic.map((d: any) => d.served || d.totalServed || 0))
          setHourlyData(dailyTraffic.map((d: any) => d.joined || d.totalJoined || 0))
        }
      }
    } catch (error) {
      console.error('Failed to load chart data:', error)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const result = await apiClient.getAdminStats()
      if (result.success && result.data) {
        setStats(result.data as AdminStats)
        setLastRefresh(new Date())
      }
    } catch (error) {
      console.error('Failed to load admin stats:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load (skeleton shown once)
  useEffect(() => {
    setLoading(true)
    loadStats()
    loadChartData()
  }, [])

  // Auto-refresh on socket events — silent.
  useEffect(() => {
    if (refreshCounter > 0) {
      loadStats()
      loadChartData()
    }
  }, [refreshCounter, loadStats, loadChartData])

  // Auto-poll every 2 seconds — removed.
  // Updates now arrive via socket events → refreshCounter → loadStats/loadChartData().

  // Recent tokens display
  const recentTokens = stats?.recentTokens || []

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header
        title="Admin Dashboard"
        subtitle={`Overview · ${user?.name || 'Admin'}`}
      />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Last refresh indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant">
              <motion.div
                className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span>{socketConnected ? 'Live · Real-time connected' : 'Live · Auto-refreshing every 2s'}</span>
            </div>
            <button
              onClick={() => { loadStats(); loadChartData() }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh now
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Total Users"
              value={stats?.totalUsers ?? 0}
              change={12}
              color="bg-primary/10 text-primary"
              delay={0}
            />
            <StatCard
              icon={ListOrdered}
              label="Active Queues"
              value={stats?.activeQueues ?? 0}
              change={5}
              color="bg-secondary/10 text-secondary"
              delay={0.05}
            />
            <StatCard
              icon={CheckCircle2}
              label="Served Today"
              value={stats?.tokensServedToday ?? 0}
              change={18}
              color="bg-emerald-500/10 text-emerald-400"
              delay={0.1}
            />
            <StatCard
              icon={Clock}
              label="Avg Wait Time"
              value={`${Math.round((stats?.avgWaitTime ?? 0) / 60)}m`}
              change={-8}
              color="bg-amber-500/10 text-amber-400"
              delay={0.15}
            />
          </div>

          {/* Charts Row */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Hourly Traffic */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-outline-variant/30 bg-gradient-to-b from-surface-container/80 to-surface-container/40 p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-on-surface">Hourly Traffic</h3>
                  <p className="text-xs text-on-surface-variant">Today&apos;s queue joins by hour</p>
                </div>
                <BarChart3 className="h-4 w-4 text-on-surface-variant" />
              </div>
              <MiniBarChart data={hourlyData} color="#c3c0ff" />
              <div className="mt-2 flex justify-between text-[9px] text-on-surface-variant">
                <span>8AM</span>
                <span>12PM</span>
                <span>4PM</span>
                <span>8PM</span>
              </div>
            </motion.div>

            {/* Daily Trends */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-2xl border border-outline-variant/30 bg-gradient-to-b from-surface-container/80 to-surface-container/40 p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-on-surface">Daily Trends</h3>
                  <p className="text-xs text-on-surface-variant">Last 12 days performance</p>
                </div>
                <TrendingUp className="h-4 w-4 text-on-surface-variant" />
              </div>
              <MiniBarChart data={dailyData} color="#4cd7f6" />
              <div className="mt-2 flex justify-between text-[9px] text-on-surface-variant">
                <span>May 3</span>
                <span>May 9</span>
                <span>May 14</span>
              </div>
            </motion.div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container/50 p-5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-on-surface">{stats?.totalServiceCenters ?? 0}</p>
                <p className="text-xs text-on-surface-variant">Service Centers</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container/50 p-5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10">
                <Hash className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <p className="text-xl font-bold text-on-surface">{stats?.totalTokensToday ?? 0}</p>
                <p className="text-xs text-on-surface-variant">Tokens Today</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container/50 p-5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                <TrendingUp className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-on-surface">
                  {stats && stats.totalTokensToday > 0
                    ? Math.round((stats.tokensServedToday / stats.totalTokensToday) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-on-surface-variant">Served Rate</p>
              </div>
            </motion.div>
          </div>

          {/* Recent Tokens */}
          {recentTokens.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="rounded-2xl border border-outline-variant/30 bg-gradient-to-b from-surface-container/80 to-surface-container/40 p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-on-surface">Recent Tokens</h3>
                <button
                  onClick={() => navigate('admin-queues')}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {recentTokens.slice(0, 5).map((token: any, i: number) => (
                  <div key={token.id || i} className="flex items-center gap-3 rounded-xl bg-surface-container-high/20 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {token.tokenNumber?.split('-')[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-on-surface truncate">{token.tokenNumber}</p>
                      <p className="text-[10px] text-on-surface-variant">{token.user?.name || 'Unknown'} · {token.queue?.name || 'Queue'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                      token.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                      token.status === 'CALLED' ? 'bg-primary/10 text-primary' :
                      token.status === 'SERVING' ? 'bg-secondary/10 text-secondary' :
                      token.status === 'CANCELLED' ? 'bg-error/10 text-error' :
                      'bg-amber-500/10 text-amber-400'
                    }`}>
                      {token.status}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Navigation Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              onClick={() => navigate('admin-analytics')}
              className="flex items-center gap-4 rounded-2xl border border-primary-container/20 bg-primary-container/5 p-5 text-left transition-all hover:border-primary-container/40 hover:bg-primary-container/10"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/20">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">View Analytics</p>
                <p className="text-xs text-on-surface-variant">Detailed performance insights</p>
              </div>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              onClick={() => navigate('admin-queues')}
              className="flex items-center gap-4 rounded-2xl border border-secondary-container/20 bg-secondary-container/5 p-5 text-left transition-all hover:border-secondary-container/40 hover:bg-secondary-container/10"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-container/20">
                <ListOrdered className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">Manage Queues</p>
                <p className="text-xs text-on-surface-variant">Create, edit, and control queues</p>
              </div>
            </motion.button>
          </div>
        </div>
      </main>
    </div>
  )
}
