'use client'

import { useAppStore } from '@/lib/store'
import { Header } from './header'
import { Switch } from '@/components/ui/switch'
import { motion } from 'framer-motion'
import { Moon, Sun, Bell, Shield, Globe, Volume2, Vibrate, Eye } from 'lucide-react'

export function SettingsScreen() {
  const { theme, toggleTheme, settings, updateSetting } = useAppStore()

  const settingGroups = [
    {
      title: 'Notifications',
      items: [
        { key: 'pushNotifications' as const, icon: Bell, label: 'Push Notifications', desc: 'Receive push notifications for queue updates' },
        { key: 'tokenAlerts' as const, icon: Volume2, label: 'Token Alerts', desc: 'Get alerted when your token is called' },
        { key: 'queueUpdates' as const, icon: Globe, label: 'Queue Updates', desc: 'Notifications for queue status changes' },
        { key: 'soundAlerts' as const, icon: Volume2, label: 'Sound Alerts', desc: 'Play sound when receiving notifications' },
        { key: 'vibration' as const, icon: Vibrate, label: 'Vibration', desc: 'Vibrate on notification' },
      ],
    },
    {
      title: 'Display',
      items: [
        { key: 'liveTracking' as const, icon: Eye, label: 'Live Tracking', desc: 'Auto-update queue position in real-time' },
        { key: 'autoRefresh' as const, icon: Globe, label: 'Auto Refresh', desc: 'Automatically refresh queue data' },
        { key: 'compactView' as const, icon: Eye, label: 'Compact View', desc: 'Show more items on screen' },
      ],
    },
  ]

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
      <Header title="Settings" showQr={false} showNotifications={false} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-md space-y-6">
          {/* Theme Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/50">
                  {theme === 'dark' ? <Moon className="h-5 w-5 text-[#4F46E5]" /> : <Sun className="h-5 w-5 text-amber-400" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Dark Mode</p>
                  <p className="text-xs text-slate-500">Toggle dark/light theme</p>
                </div>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={toggleTheme}
                className="data-[state=checked]:bg-[#4F46E5]"
              />
            </div>
          </motion.div>

          {/* Setting Groups */}
          {settingGroups.map((group, gi) => (
            <motion.div
              key={group.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + gi * 0.1 }}
              className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-5"
            >
              <h3 className="mb-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {group.title}
              </h3>
              <div className="space-y-4">
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/50">
                        <item.icon className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-300">{item.label}</p>
                        <p className="text-[10px] text-slate-600">{item.desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings[item.key]}
                      onCheckedChange={(checked) => updateSetting(item.key, checked)}
                      className="data-[state=checked]:bg-[#4F46E5]"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          ))}

          {/* Privacy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-slate-800/50 bg-slate-900/50 p-5"
          >
            <h3 className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Privacy & Security</h3>
            <div className="space-y-2 text-xs text-slate-500">
              <p>Your data is encrypted end-to-end and stored securely.</p>
              <p>QueueSeva never shares your personal information with third parties.</p>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-600">
              <Shield className="h-3 w-3" />
              <span>Version 1.0.0</span>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
