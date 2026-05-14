'use client'

import { motion } from 'framer-motion'
import {
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  LogOut,
  ChevronRight,
  Moon,
  Bell,
  HelpCircle,
  Info,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Header } from './header'
import { Badge } from '@/components/ui/badge'

export function ProfileScreen() {
  const { user, logout, navigate } = useAppStore()

  const menuItems = [
    { icon: Bell, label: 'Notification Preferences', action: () => navigate('settings') },
    { icon: Moon, label: 'Appearance', action: () => navigate('settings') },
    { icon: Shield, label: 'Privacy & Security', action: () => navigate('settings') },
    { icon: HelpCircle, label: 'Help & Support', action: () => {} },
    { icon: Info, label: 'About QueueSeva', action: () => {} },
  ]

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
      <Header title="Profile" showQr={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-md space-y-6">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl border border-slate-800/50 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-6 text-center backdrop-blur-sm"
          >
            <div className="absolute left-1/2 top-0 h-24 w-24 -translate-x-1/2 rounded-full bg-[#4F46E5]/20 blur-[40px]" />
            <div className="relative z-10">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#06B6D4] text-2xl font-bold text-white shadow-xl shadow-[#4F46E5]/20">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <h2 className="mt-4 text-xl font-bold text-white">{user?.name || 'User'}</h2>
              <p className="text-sm text-slate-400">{user?.email || 'user@example.com'}</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    user?.role === 'ADMIN'
                      ? 'bg-[#4F46E5]/10 text-[#4F46E5] border-[#4F46E5]/20'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700'
                  }
                >
                  <Shield className="mr-1 h-3 w-3" />
                  {user?.role || 'USER'}
                </Badge>
              </div>
            </div>
          </motion.div>

          {/* Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-5"
          >
            <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Info</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/50">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Email</p>
                  <p className="text-sm text-white">{user?.email || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/50">
                  <Phone className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Phone</p>
                  <p className="text-sm text-white">{user?.phone || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/50">
                  <Calendar className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Member Since</p>
                  <p className="text-sm text-white">
                    {user?.id ? 'May 2026' : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Menu */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-slate-800/50 bg-slate-900/50 overflow-hidden"
          >
            {menuItems.map((item, i) => (
              <button
                key={item.label}
                onClick={item.action}
                className="flex w-full items-center gap-3 border-b border-slate-800/30 px-5 py-3.5 text-left transition-colors hover:bg-slate-800/30 last:border-0"
              >
                <item.icon className="h-4 w-4 text-slate-500" />
                <span className="flex-1 text-sm text-slate-300">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            ))}
          </motion.div>

          {/* Sign Out */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm font-medium text-red-400 transition-all hover:bg-red-500/10 hover:border-red-500/30"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
