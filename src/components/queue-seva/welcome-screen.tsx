'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Shield, Zap, Clock, Users, QrCode, BarChart3 } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'

const features = [
  { icon: QrCode, title: 'QR Scan & Join', desc: 'Scan QR codes to instantly join any queue' },
  { icon: Clock, title: 'Live Tracking', desc: 'Real-time position and wait time updates' },
  { icon: Zap, title: 'Smart Tokens', desc: 'Auto-generated digital queue tokens' },
  { icon: Users, title: 'Multi-Queue', desc: 'Join multiple service queues simultaneously' },
  { icon: Shield, title: 'Secure', desc: 'Enterprise-grade security and data protection' },
  { icon: BarChart3, title: 'Analytics', desc: 'Comprehensive queue performance insights' },
]

export function WelcomeScreen() {
  const navigate = useAppStore((s) => s.navigate)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Hero Section */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-[#4F46E5]/8 blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-[#06B6D4]/8 blur-[100px]" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
        </div>

        <motion.div
          className="relative z-10 flex max-w-lg flex-col items-center text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          {/* Logo */}
          <motion.div
            className="mb-8"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'backOut' }}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F46E5] to-[#06B6D4] shadow-2xl shadow-[#4F46E5]/30">
              <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
                <path
                  d="M16 8H32C36.4183 8 40 11.5817 40 16V32C40 36.4183 36.4183 40 32 40H16C11.5817 40 8 36.4183 8 32V16C8 11.5817 11.5817 8 16 8Z"
                  stroke="white"
                  strokeWidth="2.5"
                  fill="none"
                />
                <path d="M16 18H32" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M16 24H28" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M16 30H24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="mb-4 text-5xl font-bold tracking-tight text-white sm:text-6xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            Queue
            <span className="bg-gradient-to-r from-[#4F46E5] to-[#06B6D4] bg-clip-text text-transparent">
              Seva
            </span>
          </motion.h1>

          <motion.p
            className="mb-2 text-lg font-medium text-slate-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Smart Queue Management System
          </motion.p>

          <motion.p
            className="mb-10 max-w-sm text-sm text-slate-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            Skip the wait. Join queues digitally, track your position in real-time,
            and get instant notifications when it&apos;s your turn.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="flex w-full max-w-xs flex-col gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <Button
              onClick={() => navigate('register')}
              className="group h-12 w-full bg-gradient-to-r from-[#4F46E5] to-[#4338CA] text-base font-semibold text-white shadow-lg shadow-[#4F46E5]/25 transition-all hover:shadow-xl hover:shadow-[#4F46E5]/30 hover:brightness-110"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>

            <Button
              onClick={() => navigate('login')}
              variant="outline"
              className="h-12 w-full border-slate-700 bg-slate-800/50 text-base font-semibold text-slate-300 backdrop-blur-sm transition-all hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            >
              Sign In
            </Button>
          </motion.div>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          className="relative z-10 mt-16 grid w-full max-w-2xl grid-cols-2 gap-3 px-4 sm:grid-cols-3"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-800/50 bg-slate-900/50 p-4 backdrop-blur-sm transition-all hover:border-[#4F46E5]/30 hover:bg-slate-800/50"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 + index * 0.1, duration: 0.4 }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F46E5]/10">
                <feature.icon className="h-5 w-5 text-[#4F46E5]" />
              </div>
              <h3 className="text-center text-xs font-semibold text-slate-300">{feature.title}</h3>
              <p className="text-center text-[10px] leading-tight text-slate-500">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 pt-4 text-center">
        <p className="text-xs text-slate-600">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
