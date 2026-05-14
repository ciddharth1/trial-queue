'use client'

import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

export function SplashScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F172A]">
      {/* Animated background circles */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-[#4F46E5]/10 blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-[#06B6D4]/10 blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4F46E5]/5 blur-3xl"
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Logo */}
        <motion.div
          className="relative"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'backOut' }}
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-[#4F46E5] to-[#06B6D4] shadow-2xl shadow-[#4F46E5]/30">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M16 8H32C36.4183 8 40 11.5817 40 16V32C40 36.4183 36.4183 40 32 40H16C11.5817 40 8 36.4183 8 32V16C8 11.5817 11.5817 8 16 8Z"
                stroke="white"
                strokeWidth="2.5"
                fill="none"
              />
              <path d="M16 18H32" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M16 24H28" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M16 30H24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="34" cy="34" r="6" fill="#06B6D4" stroke="#0F172A" strokeWidth="2" />
              <path d="M34 31V37M31 34H37" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <motion.div
            className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-[#06B6D4]"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.div>

        {/* Brand Name */}
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Queue<span className="bg-gradient-to-r from-[#4F46E5] to-[#06B6D4] bg-clip-text text-transparent">Seva</span>
          </h1>
          <p className="text-sm font-medium tracking-widest text-slate-400 uppercase">
            Smart Queue Management
          </p>
        </motion.div>

        {/* Loading indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="mt-4 flex items-center gap-2"
        >
          <Loader2 className="h-4 w-4 animate-spin text-[#4F46E5]" />
          <span className="text-xs text-slate-500">Initializing system...</span>
        </motion.div>
      </motion.div>
    </div>
  )
}
