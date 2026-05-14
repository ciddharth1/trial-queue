'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QrCode, Camera, ScanLine, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Header } from './header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function QRScannerScreen() {
  const { navigate, user, setSelectedQueue, setSelectedToken, setUserTokens, userTokens } = useAppStore()
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [scannedResult, setScannedResult] = useState<{ queueId: string; queueName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const handleScan = useCallback(() => {
    setScanning(true)
    setError(null)
    // Simulate QR scan result
    setTimeout(() => {
      setScanning(false)
      // Demo: simulate finding a queue
      setScannedResult({
        queueId: 'demo-queue-001',
        queueName: 'General Service Queue',
      })
    }, 2000)
  }, [])

  const handleManualJoin = async () => {
    if (!manualCode.trim()) {
      setError('Please enter a queue code')
      return
    }
    // Try to find queue by ID
    try {
      const result = await apiClient.getQueue(manualCode.trim())
      if (result.success && result.data) {
        setSelectedQueue(result.data as any)
        navigate('queue-detail')
      } else {
        setError('Queue not found. Check the code and try again.')
      }
    } catch {
      setError('Failed to find queue. Please try again.')
    }
  }

  const handleJoinScanned = async () => {
    if (!scannedResult || !user) return
    setJoining(true)
    try {
      const result = await apiClient.joinQueue(scannedResult.queueId)
      if (result.success && result.data) {
        const token = result.data as any
        token.queueName = scannedResult.queueName
        setSelectedToken(token)
        setUserTokens([...userTokens, token])
        navigate('token-display')
      } else {
        setError(result.error || 'Failed to join queue')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-[#0F172A]">
      <Header title="QR Scanner" subtitle="Scan to join a queue" showQr={false} />

      <main className="flex flex-1 flex-col items-center p-4 sm:p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Scanner Area */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-slate-700 bg-slate-900/50"
          >
            {scanning ? (
              <>
                {/* Scan animation */}
                <div className="absolute inset-8 rounded-2xl border-2 border-[#4F46E5]/50">
                  <motion.div
                    className="absolute left-0 right-0 h-0.5 bg-[#4F46E5]"
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {/* Corner accents */}
                  <div className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-[#4F46E5]" />
                  <div className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-[#4F46E5]" />
                  <div className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-[#4F46E5]" />
                  <div className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-[#4F46E5]" />
                </div>
                <p className="text-sm text-slate-400">Scanning...</p>
              </>
            ) : scannedResult ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3 p-6 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">{scannedResult.queueName}</h3>
                <p className="text-xs text-slate-500">Queue found! Join now?</p>
                <Button
                  onClick={handleJoinScanned}
                  disabled={joining}
                  className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                >
                  {joining ? 'Joining...' : 'Join Queue'}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center gap-4 p-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800/50">
                  <Camera className="h-10 w-10 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">Point camera at QR code</p>
                  <p className="mt-1 text-xs text-slate-500">Or enter queue code manually below</p>
                </div>
                <Button
                  onClick={handleScan}
                  className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                >
                  <ScanLine className="mr-2 h-4 w-4" />
                  Start Scanning
                </Button>
              </div>
            )}
          </motion.div>

          {/* Manual Entry */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-800" />
              <span className="text-xs text-slate-600">or enter code manually</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-2">
              <Input
                placeholder="Enter queue code..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="h-11 border-slate-800 bg-slate-900/80 text-white placeholder:text-slate-600 focus:border-[#4F46E5]"
              />
              <Button
                onClick={handleManualJoin}
                className="h-11 bg-[#4F46E5] text-white hover:bg-[#4338CA]"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>

          {/* Recent scans */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2"
          >
            <h3 className="text-xs font-medium text-slate-500">Recent Scans</h3>
            <div className="rounded-xl border border-slate-800/30 bg-slate-900/20 p-4 text-center">
              <QrCode className="mx-auto h-8 w-8 text-slate-700" />
              <p className="mt-2 text-xs text-slate-600">No recent scans</p>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
