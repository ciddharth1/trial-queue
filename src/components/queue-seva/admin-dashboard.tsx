'use client'

import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Header } from './header'

interface AdminStats {
  totalUsers: number
  activeQueues: number
  tokensServedToday: number
  avgWaitTime: number
  totalServiceCenters: number
  totalTokensToday: number
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
      className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm"
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
                : 'bg-red-500/10 text-red-400'
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
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </motion.div>
  )
}

// Mini chart using CSS bars
function MiniBarChart({ data, color = '#4F46E5' }: { data: number[]; color?: string }) {
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
  const { navigate, user, refreshCounter } = useAppStore()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  // Auto-refresh when refreshCounter changes (triggered by user/admin actions)
  useEffect(() => {
    if (refreshCounter > 0) {
      loadStats()
      loadChartData()
    }
  }, [refreshCounter])

  // Auto-poll every 8 seconds for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats()
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  const loadStats = async () => {
    setLoading(true)
    try {
      const result = await apiClient.getAdminStats()
      if (result.success && result.data) {
        setStats(result.data as AdminStats)
      }
    } catch (error) {
      console.error('Failed to load admin stats:', error)
    } finally {
      setLoading(false)
    }
  }

  // Load analytics data for charts
  const [hourlyData, setHourlyData] = useState([12, 19, 8, 25, 32, 28, 45, 52, 38, 42, 35, 28])
  const [dailyData, setDailyData] = useState([120, 145, 132, 168, 155, 142, 178, 190, 165, 185, 170, 195])

  useEffect(() => {
    loadChartData()
  }, [])

  const loadChartData = async () => {
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
  }

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
      <Header
        title="Admin Dashboard"
        subtitle={`Overview · ${user?.name || 'Admin'}`}
      />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Total Users"
              value={stats?.totalUsers ?? 1247}
              change={12}
              color="bg-[#4F46E5]/10 text-[#4F46E5]"
              delay={0}
            />
            <StatCard
              icon={ListOrdered}
              label="Active Queues"
              value={stats?.activeQueues ?? 18}
              change={5}
              color="bg-[#06B6D4]/10 text-[#06B6D4]"
              delay={0.05}
            />
            <StatCard
              icon={CheckCircle2}
              label="Served Today"
              value={stats?.tokensServedToday ?? 342}
              change={18}
              color="bg-emerald-500/10 text-emerald-400"
              delay={0.1}
            />
            <StatCard
              icon={Clock}
              label="Avg Wait Time"
              value={`${Math.round((stats?.avgWaitTime ?? 420) / 60)}m`}
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
              className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Hourly Traffic</h3>
                  <p className="text-xs text-slate-500">Today&apos;s queue joins by hour</p>
                </div>
                <BarChart3 className="h-4 w-4 text-slate-600" />
              </div>
              <MiniBarChart data={hourlyData} color="#4F46E5" />
              <div className="mt-2 flex justify-between text-[9px] text-slate-600">
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
              className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Daily Trends</h3>
                  <p className="text-xs text-slate-500">Last 12 days performance</p>
                </div>
                <TrendingUp className="h-4 w-4 text-slate-600" />
              </div>
              <MiniBarChart data={dailyData} color="#06B6D4" />
              <div className="mt-2 flex justify-between text-[9px] text-slate-600">
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
              className="flex items-center gap-4 rounded-2xl border border-slate-800/50 bg-slate-900/50 p-5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4F46E5]/10">
                <Building2 className="h-6 w-6 text-[#4F46E5]" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats?.totalServiceCenters ?? 6}</p>
                <p className="text-xs text-slate-500">Service Centers</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="flex items-center gap-4 rounded-2xl border border-slate-800/50 bg-slate-900/50 p-5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#06B6D4]/10">
                <Hash className="h-6 w-6 text-[#06B6D4]" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats?.totalTokensToday ?? 524}</p>
                <p className="text-xs text-slate-500">Tokens Today</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex items-center gap-4 rounded-2xl border border-slate-800/50 bg-slate-900/50 p-5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                <TrendingUp className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">
                  {stats && stats.totalTokensToday > 0
                    ? Math.round((stats.tokensServedToday / stats.totalTokensToday) * 100)
                    : 94}%
                </p>
                <p className="text-xs text-slate-500">Served Rate</p>
              </div>
            </motion.div>
          </div>

          {/* Navigation Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              onClick={() => navigate('admin-analytics')}
              className="flex items-center gap-4 rounded-2xl border border-[#4F46E5]/20 bg-[#4F46E5]/5 p-5 text-left transition-all hover:border-[#4F46E5]/40 hover:bg-[#4F46E5]/10"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4F46E5]/20">
                <BarChart3 className="h-6 w-6 text-[#4F46E5]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">View Analytics</p>
                <p className="text-xs text-slate-500">Detailed performance insights</p>
              </div>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              onClick={() => navigate('admin-queues')}
              className="flex items-center gap-4 rounded-2xl border border-[#06B6D4]/20 bg-[#06B6D4]/5 p-5 text-left transition-all hover:border-[#06B6D4]/40 hover:bg-[#06B6D4]/10"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#06B6D4]/20">
                <ListOrdered className="h-6 w-6 text-[#06B6D4]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Manage Queues</p>
                <p className="text-xs text-slate-500">Create, edit, and control queues</p>
              </div>
            </motion.button>
          </div>
        </div>
      </main>
    </div>
  )
}
