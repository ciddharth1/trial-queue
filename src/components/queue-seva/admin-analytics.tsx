'use client'

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
import { Header } from './header'

// Simulated analytics data
const weeklyData = [
  { day: 'Mon', joined: 85, served: 78, cancelled: 5 },
  { day: 'Tue', joined: 92, served: 88, cancelled: 3 },
  { day: 'Wed', joined: 110, served: 102, cancelled: 6 },
  { day: 'Thu', joined: 95, served: 90, cancelled: 4 },
  { day: 'Fri', joined: 125, served: 118, cancelled: 5 },
  { day: 'Sat', joined: 140, served: 132, cancelled: 6 },
  { day: 'Sun', joined: 78, served: 72, cancelled: 4 },
]

const peakHours = [
  { hour: '8-9 AM', traffic: 15, percent: 25 },
  { hour: '9-10 AM', traffic: 28, percent: 47 },
  { hour: '10-11 AM', traffic: 42, percent: 70 },
  { hour: '11-12 PM', traffic: 55, percent: 92 },
  { hour: '12-1 PM', traffic: 60, percent: 100 },
  { hour: '1-2 PM', traffic: 48, percent: 80 },
  { hour: '2-3 PM', traffic: 38, percent: 63 },
  { hour: '3-4 PM', traffic: 32, percent: 53 },
  { hour: '4-5 PM', traffic: 25, percent: 42 },
  { hour: '5-6 PM', traffic: 18, percent: 30 },
]

const queuePerformance = [
  { name: 'General Service', prefix: 'A', served: 156, wait: 12, noShow: 3, satisfaction: 94 },
  { name: 'Priority Counter', prefix: 'B', served: 89, wait: 8, noShow: 1, satisfaction: 97 },
  { name: 'Billing & Payments', prefix: 'C', served: 72, wait: 15, noShow: 5, satisfaction: 88 },
  { name: 'VIP Service', prefix: 'D', served: 34, wait: 4, noShow: 0, satisfaction: 99 },
  { name: 'Returns & Exchange', prefix: 'E', served: 48, wait: 18, noShow: 7, satisfaction: 82 },
]

export function AdminAnalyticsScreen() {
  const { navigate } = useAppStore()

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
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
            <div className="flex items-end gap-2 h-40">
              {weeklyData.map((day, i) => (
                <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-end gap-0.5 h-32">
                    <motion.div
                      className="flex-1 rounded-t bg-[#4F46E5]"
                      initial={{ height: 0 }}
                      animate={{ height: `${(day.joined / 140) * 100}%` }}
                      transition={{ delay: i * 0.05, duration: 0.5 }}
                    />
                    <motion.div
                      className="flex-1 rounded-t bg-[#06B6D4]"
                      initial={{ height: 0 }}
                      animate={{ height: `${(day.served / 140) * 100}%` }}
                      transition={{ delay: i * 0.05 + 0.1, duration: 0.5 }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-600">{day.day}</span>
                </div>
              ))}
            </div>
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
              <div className="space-y-2">
                {peakHours.map((hour, i) => (
                  <motion.div
                    key={hour.hour}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.03 }}
                    className="flex items-center gap-3"
                  >
                    <span className="w-16 text-[10px] text-slate-500">{hour.hour}</span>
                    <div className="flex-1 h-5 overflow-hidden rounded-full bg-slate-800/50">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-[#4F46E5] to-[#06B6D4]"
                        initial={{ width: 0 }}
                        animate={{ width: `${hour.percent}%` }}
                        transition={{ delay: 0.2 + i * 0.03, duration: 0.6 }}
                      />
                    </div>
                    <span className="w-8 text-right text-[10px] font-semibold text-slate-400">
                      {hour.traffic}
                    </span>
                  </motion.div>
                ))}
              </div>
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
                  <p className="text-xs text-slate-500">Per-queue metrics today</p>
                </div>
                <TrendingUp className="h-4 w-4 text-slate-600" />
              </div>
              <div className="space-y-3">
                {queuePerformance.map((queue, i) => (
                  <motion.div
                    key={queue.prefix}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.05 }}
                    className="flex items-center gap-3 rounded-xl bg-slate-800/20 p-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4F46E5]/10 text-sm font-bold text-[#4F46E5]">
                      {queue.prefix}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{queue.name}</p>
                      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                          {queue.served}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5 text-[#06B6D4]" />
                          {queue.wait}m
                        </span>
                        <span className="flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                          {queue.noShow}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{queue.satisfaction}%</p>
                      <p className="text-[9px] text-slate-500">Satisfaction</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Avg Service Time', value: '5.2m', change: -8, icon: Clock, color: 'text-[#06B6D4]' },
              { label: 'No-Show Rate', value: '3.4%', change: -12, icon: XCircle, color: 'text-amber-400' },
              { label: 'Satisfaction', value: '94%', change: 2, icon: CheckCircle2, color: 'text-emerald-400' },
              { label: 'Throughput', value: '48/hr', change: 15, icon: ArrowUpRight, color: 'text-[#4F46E5]' },
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
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-500">{kpi.label}</p>
                  <span
                    className={`text-[10px] font-semibold ${
                      kpi.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {kpi.change >= 0 ? '+' : ''}{kpi.change}%
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
