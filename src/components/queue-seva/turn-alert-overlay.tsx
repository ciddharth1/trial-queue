'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, X } from 'lucide-react'
import { useAppStore } from '@/lib/store'

/**
 * Full-viewport "It's your turn!" overlay.
 *
 * Driven by `store.activeAlert`, which is set by `useTokenAlerts` when a
 * token:called/serving event arrives for the current user. The overlay
 * auto-dismisses after 8 seconds. Click anywhere outside the dialog (or the
 * X button) to dismiss earlier. Mounted at the root of `<Home>` so it sits
 * above every screen and is impossible to miss.
 */
export function TurnAlertOverlay() {
  const activeAlert = useAppStore((s) => s.activeAlert)
  const setActiveAlert = useAppStore((s) => s.setActiveAlert)

  useEffect(() => {
    if (!activeAlert) return
    const id = setTimeout(() => setActiveAlert(null), 8000)
    return () => clearTimeout(id)
  }, [activeAlert, setActiveAlert])

  return (
    <AnimatePresence>
      {activeAlert && (
        <motion.div
          key="turn-alert-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setActiveAlert(null)}
          role="alert"
          aria-live="assertive"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/15 via-slate-900 to-slate-950 p-6 text-center shadow-[0_0_60px_rgba(16,185,129,0.35)]"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setActiveAlert(null)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Pulsing checkmark */}
            <motion.div
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400/60"
              animate={{
                scale: [1, 1.08, 1],
                boxShadow: [
                  '0 0 0 0 rgba(16,185,129,0.6)',
                  '0 0 0 18px rgba(16,185,129,0)',
                  '0 0 0 0 rgba(16,185,129,0)',
                ],
              }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <CheckCircle2 className="h-10 w-10 text-emerald-300" />
            </motion.div>

            <h2 className="mt-5 text-2xl font-black text-white tracking-tight">
              {activeAlert.title}
            </h2>

            {activeAlert.tokenNumber && (
              <div className="mt-3 inline-flex items-baseline gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 ring-1 ring-emerald-500/20">
                <span className="text-[10px] uppercase tracking-widest text-emerald-300">
                  Token
                </span>
                <span className="font-mono text-2xl font-bold text-white">
                  {activeAlert.tokenNumber}
                </span>
              </div>
            )}

            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              {activeAlert.message}
            </p>

            {activeAlert.counterName && (
              <p className="mt-1 text-xs text-slate-500">
                Counter: <span className="font-medium text-slate-300">{activeAlert.counterName}</span>
              </p>
            )}

            <button
              type="button"
              onClick={() => setActiveAlert(null)}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-emerald-600"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
