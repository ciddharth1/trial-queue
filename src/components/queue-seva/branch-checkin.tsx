'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin,
  Camera,
  ScanLine,
  CheckCircle2,
  Clock,
  Wifi,
  Accessibility,
  Coffee,
  Zap,
  Crosshair,
  MoreVertical,
  Home,
  Ticket,
  Bell,
  User,
  Delete,
  CircleCheck,
  Grid3x3,
} from 'lucide-react'
import { useAppStore, type AppQueue } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { emitRefresh } from '@/hooks/use-realtime'
import { toast } from 'sonner'

export function BranchCheckinScreen() {
  const { navigate, user, setSelectedQueue, setSelectedToken, setUserTokens, userTokens, queues } = useAppStore()
  const [pinCode, setPinCode] = useState('')
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [availableQueues, setAvailableQueues] = useState<AppQueue[]>([])
  const [scanResult, setScanResult] = useState<{ queueId: string; queueName: string } | null>(null)

  // Pre-generate QR pattern to avoid Math.random() in render
  const qrPattern = useMemo(() => Array.from({ length: 64 }, () => Math.random() > 0.4), [])

  // Load available queues
  useEffect(() => {
    const loadQueues = async () => {
      try {
        const result = await apiClient.getQueues({ status: 'ACTIVE' })
        if (result.success && result.data) {
          const items = (result.data as any).items || []
          setAvailableQueues(items)
        }
      } catch (error) {
        console.error('Failed to load queues:', error)
      }
    }
    loadQueues()
  }, [])

  // Simulate QR scan detection after 4 seconds
  useEffect(() => {
    if (!scanning) return
    const timer = setTimeout(() => {
      if (availableQueues.length > 0) {
        const randomQueue = availableQueues[Math.floor(Math.random() * availableQueues.length)]
        setScanResult({ queueId: randomQueue.id, queueName: randomQueue.name })
        setScanning(false)
      }
    }, 4000)
    return () => clearTimeout(timer)
  }, [scanning, availableQueues])

  // Use refs for stable access in callbacks
  const pinCodeRef = useRef(pinCode)
  pinCodeRef.current = pinCode
  const availableQueuesRef = useRef(availableQueues)
  availableQueuesRef.current = availableQueues

  // Manual code join - using refs to avoid stale closures
  const handleManualJoin = useCallback(async () => {
    const currentPin = pinCodeRef.current
    if (!currentPin.trim() || currentPin.length < 1) {
      setError('Please enter a valid queue code')
      return
    }
    try {
      const result = await apiClient.getQueue(currentPin.trim())
      if (result.success && result.data) {
        setSelectedQueue(result.data as any)
        navigate('queue-detail')
      } else {
        const firstQueue = availableQueuesRef.current[0]
        if (firstQueue) {
          setSelectedQueue(firstQueue)
          navigate('queue-detail')
        } else {
          setError('Queue not found. Check the code and try again.')
        }
      }
    } catch {
      setError('Failed to find queue. Please try again.')
    }
  }, [setSelectedQueue, navigate])

  // PIN pad handler
  const handlePinPress = useCallback((key: string) => {
    setError(null)
    if (key === 'backspace') {
      setPinCode(prev => prev.slice(0, -1))
    } else if (key === 'enter') {
      handleManualJoin()
    } else {
      setPinCode(prev => prev.length < 6 ? prev + key : prev)
    }
  }, [handleManualJoin])

  // Join scanned queue
  const handleJoinScanned = async () => {
    if (!scanResult || !user) return
    setJoining(true)
    try {
      const result = await apiClient.joinQueue(scanResult.queueId)
      if (result.success && result.data) {
        const token = result.data as any
        token.queueName = scanResult.queueName
        setSelectedToken(token)
        setUserTokens([...userTokens, token])
        emitRefresh('queue-update')
        emitRefresh('token-update')
        toast.success(`You joined "${scanResult.queueName}"! Token: ${token.tokenNumber}`)
        navigate('live-tracker')
      } else {
        setError(result.error || 'Failed to join queue')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setJoining(false)
    }
  }

  // Quick check-in (direct join first available queue)
  const handleCheckinNow = async () => {
    if (!user || availableQueues.length === 0) {
      setError('No queues available for check-in')
      return
    }
    setJoining(true)
    setError(null)
    try {
      const queue = availableQueues[0]
      const result = await apiClient.joinQueue(queue.id)
      if (result.success && result.data) {
        const token = result.data as any
        token.queueName = queue.name
        setSelectedToken(token)
        setUserTokens([...userTokens, token])
        emitRefresh('queue-update')
        emitRefresh('token-update')
        toast.success(`Checked in! Token: ${token.tokenNumber}`)
        navigate('live-tracker')
      } else {
        setError(result.error || 'Failed to check in')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  const pinKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'backspace', '0', 'enter']

  return (
    <div className="min-h-screen bg-background text-on-background overflow-x-hidden pb-24 md:pb-0">
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center h-16 backdrop-blur-xl bg-surface-container-low/90 border-b border-white/5 shadow-sm px-4 md:px-16">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-primary" />
          <span className="font-bold tracking-tight text-primary" style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif', fontSize: '24px', fontWeight: 700 }}>
            QueueSeva
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('notifications')}
            className="hover:bg-surface-container-highest/50 p-2 rounded-full transition-colors active:scale-95"
          >
            <Bell className="h-5 w-5 text-on-surface-variant" />
          </button>
          <button className="hover:bg-surface-container-highest/50 p-2 rounded-full transition-colors active:scale-95">
            <MoreVertical className="h-5 w-5 text-on-surface-variant" />
          </button>
        </div>
      </header>

      <main className="pt-24 pb-12 px-4 md:px-16 max-w-7xl mx-auto">
        {/* Title Section */}
        <div className="mb-8">
          <h1 className="text-on-surface mb-2" style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif', fontSize: 'clamp(24px, 4vw, 32px)', lineHeight: 1.2, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Check-in at Downtown Branch
          </h1>
          <p className="text-on-surface-variant max-w-2xl" style={{ fontSize: '16px', lineHeight: 1.5 }}>
            Scan the branch QR code or enter the 6-digit access code to join the queue instantly.
          </p>
        </div>

        {/* Error display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 flex items-center gap-2 rounded-xl border border-error/20 bg-error-container/10 p-3 text-sm text-error"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bento-grid">
          {/* QR Scanner Interface (Large Bento Card) */}
          <div className="col-span-12 lg:col-span-7 aspect-square md:aspect-video glass-panel rounded-xl overflow-hidden relative group">
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-surface-container-lowest/40">
              <div className="w-64 h-64 md:w-80 md:h-80 relative border-2 border-primary/30 rounded-2xl overflow-hidden p-2">
                {/* Corner accents */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-secondary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-secondary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-secondary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-secondary rounded-br-lg" />

                <div className="w-full h-full bg-surface-container-high flex items-center justify-center relative rounded-xl">
                  {scanResult ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-3 text-center p-4"
                    >
                      <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-on-surface">{scanResult.queueName}</h3>
                      <p className="text-xs text-on-surface-variant">Queue found! Join now?</p>
                      <button
                        onClick={handleJoinScanned}
                        disabled={joining}
                        className="px-6 py-2 bg-primary-container text-on-primary rounded-xl font-bold hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
                      >
                        {joining ? 'Joining...' : 'Join Queue'}
                      </button>
                    </motion.div>
                  ) : (
                    <>
                      {/* QR Code pattern */}
                      <div className="w-48 h-48 md:w-56 md:h-56 opacity-80 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="grid grid-cols-8 grid-rows-8 gap-1.5 w-40 h-40">
                          {qrPattern.map((filled, i) => (
                            <div
                              key={i}
                              className={`rounded-sm ${filled ? 'bg-on-surface/80' : 'bg-transparent'}`}
                            />
                          ))}
                        </div>
                      </div>
                      {/* Scanning line */}
                      {scanning && <div className="qr-scanner-line absolute w-full z-10" />}
                    </>
                  )}
                </div>
              </div>
              <div className="mt-8 text-center">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium animate-pulse">
                  <Camera className="h-4 w-4" />
                  {scanning ? 'Scanning for codes...' : 'Ready to scan'}
                </span>
              </div>
            </div>
          </div>

          {/* Manual Entry Pad */}
          <div className="col-span-12 md:col-span-6 lg:col-span-5 glass-panel rounded-xl p-6 md:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-tertiary-container/30 flex items-center justify-center">
                  <Grid3x3 className="h-5 w-5 text-tertiary" />
                </div>
                <h2 className="text-on-surface" style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>
                  Manual Entry
                </h2>
              </div>
              <p className="text-on-surface-variant mb-4" style={{ fontSize: '16px', lineHeight: 1.5 }}>
                Enter the code displayed at the entrance desk.
              </p>

              {/* PIN Display */}
              <div className="flex justify-center gap-2 mb-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all ${
                      i < pinCode.length
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline-variant bg-surface-container-high/50 text-on-surface-variant'
                    }`}
                    style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                  >
                    {pinCode[i] || '·'}
                  </div>
                ))}
              </div>

              {/* PIN Pad */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {pinKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => handlePinPress(key)}
                    className={`h-14 flex items-center justify-center glass-panel rounded-xl transition-all active:scale-90 ${
                      key === 'backspace'
                        ? 'text-error hover:bg-error/20'
                        : key === 'enter'
                          ? 'text-secondary hover:bg-secondary/20'
                          : 'text-on-surface hover:bg-primary/20'
                    }`}
                    style={key !== 'backspace' && key !== 'enter' ? { fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '24px', fontWeight: 700 } : {}}
                  >
                    {key === 'backspace' ? <Delete className="h-6 w-6" /> :
                     key === 'enter' ? <CircleCheck className="h-6 w-6" /> :
                     key}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCheckinNow}
              disabled={joining || availableQueues.length === 0}
              className="w-full py-4 bg-gradient-to-r from-primary-container to-tertiary-container text-on-primary rounded-xl font-bold hover:shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all active:scale-95 disabled:opacity-50"
            >
              {joining ? 'Checking in...' : 'Check-in Now'}
            </button>
          </div>

          {/* Map View */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 h-80 glass-panel rounded-xl overflow-hidden relative">
            <div className="absolute inset-0 z-0 grayscale opacity-40 brightness-50 bg-gradient-to-br from-surface-container-high to-surface-container-highest" />
            {/* Map visual elements */}
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
              <div className="relative w-full h-full">
                <svg className="w-full h-full" viewBox="0 0 200 200" fill="none" opacity="0.4">
                  <path d="M20 80 L60 40 L100 70 L140 30 L180 60" stroke="#4cd7f6" strokeWidth="1" />
                  <path d="M10 120 L50 100 L90 130 L130 90 L170 110 L190 100" stroke="#c3c0ff" strokeWidth="0.5" />
                  <path d="M30 160 L80 140 L120 170 L160 130" stroke="#464555" strokeWidth="0.5" />
                </svg>
              </div>
            </div>
            {/* Map overlay info */}
            <div className="absolute inset-0 z-10 p-6 flex flex-col justify-end bg-gradient-to-t from-background via-background/40 to-transparent">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-primary mb-1 uppercase tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '14px', fontWeight: 500, letterSpacing: '0.05em' }}>
                    Location
                  </h3>
                  <p className="text-on-surface" style={{ fontSize: '16px', lineHeight: 1.5 }}>123 Tech District, Innovation Ave.</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center border border-primary/30 pulse-glow">
                  <Crosshair className="h-5 w-5 text-primary" />
                </div>
              </div>
            </div>
          </div>

          {/* Operating Hours */}
          <div className="col-span-12 lg:col-span-4 glass-panel rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <Clock className="h-5 w-5 text-secondary" />
              <h3 className="text-on-surface" style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>
                Operating Hours
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-on-surface-variant">Mon — Fri</span>
                <span className="text-on-surface" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '14px', fontWeight: 500, letterSpacing: '0.05em' }}>09:00 — 18:00</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-on-surface-variant font-bold text-secondary">Saturday</span>
                <span className="text-secondary font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '14px', fontWeight: 500, letterSpacing: '0.05em' }}>10:00 — 14:00</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-on-surface-variant">Sunday</span>
                <span className="text-error" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '14px', fontWeight: 500 }}>Closed</span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-secondary-container animate-ping" />
                <span className="text-secondary-container" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '14px', fontWeight: 500, letterSpacing: '0.05em' }}>
                  Status: {availableQueues.length > 0 ? 'Open' : 'Closed'} · {availableQueues.reduce((acc, q) => acc + q.currentLength, 0)} waiting
                </span>
              </div>
            </div>
          </div>

          {/* Branch Info */}
          <div className="col-span-12 lg:col-span-4 glass-panel rounded-xl p-6 flex flex-col">
            <h3 className="text-on-surface mb-6" style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>
              Branch Info
            </h3>
            <div className="grid grid-cols-2 gap-4 flex-grow">
              <div className="p-4 bg-surface-container-high/50 rounded-xl flex flex-col gap-2">
                <Wifi className="h-5 w-5 text-primary" />
                <span className="text-on-surface-variant" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '12px', fontWeight: 500, letterSpacing: '0.05em' }}>Free Wi-Fi</span>
              </div>
              <div className="p-4 bg-surface-container-high/50 rounded-xl flex flex-col gap-2">
                <Accessibility className="h-5 w-5 text-primary" />
                <span className="text-on-surface-variant" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '12px', fontWeight: 500, letterSpacing: '0.05em' }}>Accessible</span>
              </div>
              <div className="p-4 bg-surface-container-high/50 rounded-xl flex flex-col gap-2">
                <Coffee className="h-5 w-5 text-primary" />
                <span className="text-on-surface-variant" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '12px', fontWeight: 500, letterSpacing: '0.05em' }}>Lounge Area</span>
              </div>
              <div className="p-4 bg-surface-container-high/50 rounded-xl flex flex-col gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <span className="text-on-surface-variant" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '12px', fontWeight: 500, letterSpacing: '0.05em' }}>Express Desk</span>
              </div>
            </div>
          </div>

          {/* Available Queues Quick Access */}
          {availableQueues.length > 0 && (
            <div className="col-span-12 glass-panel rounded-xl p-6">
              <h3 className="text-on-surface mb-4" style={{ fontFamily: 'var(--font-plus-jakarta), sans-serif', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 }}>
                Available Queues
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableQueues.slice(0, 6).map((queue) => (
                  <button
                    key={queue.id}
                    onClick={() => {
                      setSelectedQueue(queue)
                      navigate('queue-detail')
                    }}
                    className="flex items-center gap-3 p-4 bg-surface-container-high/50 rounded-xl text-left transition-all hover:bg-primary/10 hover:border-primary/30 border border-transparent"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '14px', fontWeight: 700 }}>
                      {queue.prefix}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-on-surface text-sm font-semibold truncate">{queue.name}</p>
                      <p className="text-on-surface-variant text-xs">{queue.currentLength} in queue · ~{Math.round((queue.avgServiceTime * queue.currentLength) / 60)}m wait</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Navigation Bar (Mobile) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pt-2 pb-6 md:hidden h-20 backdrop-blur-lg border-t border-white/5 bg-surface-container-low/95 rounded-t-xl shadow-lg">
        <button
          onClick={() => navigate('dashboard')}
          className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90"
        >
          <Home className="h-5 w-5" />
          <span className="mt-1 text-xs">Home</span>
        </button>
        <button
          onClick={() => navigate('my-tickets')}
          className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90"
        >
          <Ticket className="h-5 w-5" />
          <span className="mt-1 text-xs">My Tickets</span>
        </button>
        <button
          onClick={() => navigate('notifications')}
          className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90"
        >
          <Bell className="h-5 w-5" />
          <span className="mt-1 text-xs">Alerts</span>
        </button>
        <button
          onClick={() => navigate('profile')}
          className="flex flex-col items-center justify-center text-on-surface-variant px-5 py-1.5 hover:text-primary transition-colors active:scale-90"
        >
          <User className="h-5 w-5" />
          <span className="mt-1 text-xs">Profile</span>
        </button>
      </nav>
    </div>
  )
}
