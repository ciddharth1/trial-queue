'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  TrendingUp,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Header } from './header'

interface DailyData {
  date: string
  joined: number
  served: number
  cancelled: number
  noShow: number
  avgWaitTime: number
  avgServiceTime: number
}

export function AdminAnalyticsScreen() {
  const { navigate, refreshCounter } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null)
  const [weeklyData, setWeeklyData] = useState<DailyData[]>([])

  useEffect(() => {
    loadAnalytics()
  }, [])

  // Refresh when refreshCounter changes — silent.
  useEffect(() => {
    if (refreshCounter > 0) {
      loadAnalytics({ background: true })
    }
  }, [refreshCounter])

  // Auto-poll every 8 seconds — removed.
  // Updates now arrive via socket events → refreshCounter → loadAnalytics().

  const loadAnalytics = async (opts?: { background?: boolean }) => {
    if (!opts?.background) setLoading(true)
    try {
      const result = await apiClient.getAdminAnalytics({ days: 7 })
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>
        setAnalytics(data)
        const analyticsArr = (data.analytics || data.dailyTraffic || []) as unknown[]
        if (Array.isArray(analyticsArr) && analyticsArr.length > 0) {
          setWeeklyData(
            analyticsArr.map((a: unknown, index: number) => {
              const item = a as Record<string, unknown>
              return {
                date: `${new Date(item.date as string).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}`,
                joined: (item.totalJoined as number) || (item.joined as number) || 0,
                served: (item.totalServed as number) || (item.served as number) || 0,
                cancelled: (item.totalCancelled as number) || (item.cancelled as number) || 0,
                noShow: (item.totalNoShow as number) || (item.noShow as number) || 0,
                avgWaitTime: (item.avgWaitTime as number) || 0,
                avgServiceTime: (item.avgServiceTime as number) || 0,
              }
            })
          )
        }
      }
    } catch (error) {
      console.error('Failed to load analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const maxJoined = Math.max(...weeklyData.map(d => d.joined), 1)

  const summary = (analytics?.summary || {}) as Record<string, unknown>
  const peakHours = (analytics?.peakHours || []) as unknown[]

  // Calculate KPIs from real data
  const totalServed = weeklyData.reduce((sum, d) => sum + d.served, 0)
  const totalJoined = weeklyData.reduce((sum, d) => sum + d.joined, 0)
  const totalCancelled = weeklyData.reduce((sum, d) => sum + d.cancelled, 0)
  const avgWaitMin = weeklyData.length > 0
    ? Math.round(weeklyData.reduce((sum, d) => sum + d.avgWaitTime, 0) / weeklyData.length / 60)
    : 0
  const avgServiceMin = weeklyData.length > 0
    ? Math.round(weeklyData.reduce((sum, d) => sum + d.avgServiceTime, 0) / weeklyData.length / 60)
    : 0
  const noShowRate = totalJoined > 0 ? ((totalCancelled / totalJoined) * 100).toFixed(1) : '0'
  const satisfactionRate = totalJoined > 0 ? Math.round(((totalJoined - totalCancelled) / totalJoined) * 100) : 0
  const throughput = weeklyData.length > 0 ? Math.round(totalServed / weeklyData.length) : 0

  // Queue performance from analytics data
  const queuePerformance = (analytics?.queuePerformance || []) as unknown[]

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title="Analytics" subtitle="Queue performance insights" showQr={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Weekly Overview Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Weekly Overview</h3>
                <p className="text-xs text-slate-500">Queue activity this week</p>
              </div>
              <BarChart3 className="h-4 w-4 text-slate-600" />
            </div>
            {loading ? (
              <div className="flex items-end gap-2 h-40">
                {[1,2,3,4,5,6,7].map(i => (
                  <div key={i} className="flex-1 animate-pulse bg-slate-800/50 rounded-t h-full" />
                ))}
              </div>
            ) : weeklyData.length > 0 ? (
              <div className="flex items-end gap-2 h-40">
                {weeklyData.map((day, i) => (
                  <div key={`day-${i}-${day.date}`} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end gap-0.5 h-32">
                      <motion.div
                        className="flex-1 rounded-t bg-[#4F46E5]"
                        initial={{ height: 0 }}
                        animate={{ height: `${(day.joined / maxJoined) * 100}%` }}
                        transition={{ delay: i * 0.05, duration: 0.5 }}
                      />
                      <motion.div
                        className="flex-1 rounded-t bg-[#06B6D4]"
                        initial={{ height: 0 }}
                        animate={{ height: `${(day.served / maxJoined) * 100}%` }}
                        transition={{ delay: i * 0.05 + 0.1, duration: 0.5 }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-600">{day.date}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-slate-500">
                No analytics data available yet
              </div>
            )}
            <div className="mt-3 flex items-center justify-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-[#4F46E5]" />
                <span className="text-[10px] text-slate-500">Joined</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-[#06B6D4]" />
                <span className="text-[10px] text-slate-500">Served</span>
              </div>
            </div>
          </motion.div>

          {/* Peak Hours & Performance */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Peak Hours */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Peak Hours</h3>
                  <p className="text-xs text-slate-500">Traffic distribution by hour</p>
                </div>
                <Clock className="h-4 w-4 text-slate-600" />
              </div>
              {peakHours.length > 0 ? (
                <div className="space-y-2">
                  {peakHours.map((hour: any, i: number) => (
                    <motion.div
                      key={hour.hour || i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.03 }}
                      className="flex items-center gap-3"
                    >
                      <span className="w-16 text-[10px] text-slate-500">{hour.hour || `${i}:00`}</span>
                      <div className="flex-1 h-5 overflow-hidden rounded-full bg-slate-800/50">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#4F46E5] to-[#06B6D4]"
                          initial={{ width: 0 }}
                          animate={{ width: `${hour.percent || (hour.count / Math.max(...peakHours.map((h: any) => h.count || 0), 1)) * 100}%` }}
                          transition={{ delay: 0.2 + i * 0.03, duration: 0.6 }}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] font-semibold text-slate-400">
                        {hour.count || hour.traffic || 0}
                      </span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-xs text-slate-500">
                  Peak hours data will appear with more usage
                </div>
              )}
            </motion.div>

            {/* Queue Performance Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Queue Performance</h3>
                  <p className="text-xs text-slate-500">Per-queue metrics</p>
                </div>
                <TrendingUp className="h-4 w-4 text-slate-600" />
              </div>
              {queuePerformance.length > 0 ? (
                <div className="space-y-3">
                  {queuePerformance.map((queue: any, i: number) => (
                    <motion.div
                      key={queue.prefix || queue.name || i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 + i * 0.05 }}
                      className="flex items-center gap-3 rounded-xl bg-slate-800/20 p-3"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4F46E5]/10 text-sm font-bold text-[#4F46E5]">
                        {queue.prefix || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{queue.name}</p>
                        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
                          <span className="flex items-center gap-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                            {queue.served || queue.totalServed || 0}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5 text-[#06B6D4]" />
                            {queue.wait || Math.round((queue.avgWaitTime || 0) / 60)}m
                          </span>
                          <span className="flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                            {queue.noShow || queue.totalNoShow || 0}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{queue.satisfaction || '--'}%</p>
                        <p className="text-[9px] text-slate-500">Satisfaction</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Show from weekly data summary */}
                  <div className="flex items-center justify-center h-32 text-xs text-slate-500">
                    Performance data will appear with more usage
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* KPI Cards — values computed from real analytics data above. We deliberately
              don't render fake +/-X% deltas; period-over-period requires comparing
              against a previous range we haven't fetched. The footer label makes it
              clear these are values for the selected window. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Avg Service Time', value: avgServiceMin > 0 ? `${avgServiceMin}m` : '—', icon: Clock, color: 'text-[#06B6D4]' },
              { label: 'No-Show Rate', value: totalJoined > 0 ? `${noShowRate}%` : '—', icon: XCircle, color: 'text-amber-400' },
              { label: 'Satisfaction', value: totalJoined > 0 ? `${satisfactionRate}%` : '—', icon: CheckCircle2, color: 'text-emerald-400' },
              { label: 'Throughput', value: throughput > 0 ? `${throughput}/day` : '—', icon: ArrowUpRight, color: 'text-[#4F46E5]' },
            ].map((kpi, i) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-4"
              >
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                <p className="mt-2 text-xl font-bold text-white">{kpi.value}</p>
                <p className="text-[10px] text-slate-500">{kpi.label}</p>
                <p className="text-[9px] text-slate-600 mt-0.5">Last 7 days</p>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
