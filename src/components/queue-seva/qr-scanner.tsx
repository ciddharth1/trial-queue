'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  QrCode,
  Camera,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Upload,
  StopCircle,
  Image as ImageIcon,
} from 'lucide-react'
import jsQR from 'jsqr'
import { useAppStore, type AppQueue } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { emitRefresh } from '@/hooks/use-realtime'
import { Header } from './header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

// ─── QR PAYLOAD HELPERS ─────────────────────────────────
// User-side scanner accepts THREE payload shapes:
//
//   1. JSON queue invitation (printed at a counter / on a poster):
//        { type: 'QUEUE_JOIN', queueId, queueName, prefix, ... }
//      → join that queue.
//
//   2. Signed single-use token QR (qsv1:...) — the format produced by
//      /api/queue/join + /api/token/:id. These are the user's own ticket QRs.
//      We don't try to "validate" them on the user side (only admins can do
//      that) — we just route the user to view their token.
//
//   3. A bare queue id string (e.g. someone manually shares a queue cuid).
type ScanResult =
  | { kind: 'queue'; queueId: string; queueName?: string }
  | { kind: 'token'; tokenId: string }
  | { kind: 'unknown' }

function parseQrPayload(raw: string): ScanResult {
  if (!raw) return { kind: 'unknown' }
  const trimmed = raw.trim()

  // 2. Signed token payload — qsv1:base64url(json)
  if (trimmed.startsWith('qsv1:')) {
    try {
      // base64url → base64 → atob → utf8 string
      const b64 = trimmed.slice('qsv1:'.length).replace(/-/g, '+').replace(/_/g, '/')
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
      const decoded = typeof atob !== 'undefined' ? atob(padded) : ''
      if (decoded) {
        const json = JSON.parse(decoded)
        if (json && typeof json.t === 'string') {
          return { kind: 'token', tokenId: json.t }
        }
      }
    } catch {
      /* malformed qsv1 — fall through */
    }
  }

  // 1. JSON queue invitation
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && parsed.queueId) {
      return { kind: 'queue', queueId: String(parsed.queueId), queueName: parsed.queueName }
    }
  } catch {
    /* not JSON — fall through */
  }

  // 3. Bare queue id
  if (/^[a-zA-Z0-9_-]{8,40}$/.test(trimmed)) {
    return { kind: 'queue', queueId: trimmed }
  }

  return { kind: 'unknown' }
}

export function QRScannerScreen() {
  const { navigate, user, setSelectedQueue, setSelectedToken, setUserTokens, userTokens } = useAppStore()
  const [manualCode, setManualCode] = useState('')
  const [scannedResult, setScannedResult] = useState<{ queueId: string; queueName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [availableQueues, setAvailableQueues] = useState<AppQueue[]>([])
  const [cameraActive, setCameraActive] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Look up a token from a scanned signed-QR payload, then route the user
  // to view it. Called from camera + manual + image-upload paths.
  const handleScannedToken = useCallback(
    async (tokenId: string) => {
      try {
        const result = await apiClient.getToken(tokenId)
        if (!result.success || !result.data) {
          setError('That token could not be found. It may have been removed.')
          return
        }
        const data = result.data as unknown as {
          id: string
          status: string
          consumedAt?: string | null
          tokenNumber: string
        }
        setSelectedToken(data as never)
        toast.success(`Token ${data.tokenNumber} loaded`)
        navigate('token-display')
      } catch {
        setError('Failed to look up the token. Please try again.')
      }
    },
    [navigate, setSelectedToken],
  )

  // ─── Load available queues for "Quick Join" suggestions ──
  useEffect(() => {
    let cancelled = false
    const loadQueues = async () => {
      try {
        const result = await apiClient.getQueues({ status: 'ACTIVE' })
        if (cancelled) return
        if (result.success && result.data) {
          const items = result.data.items || []
          setAvailableQueues(items)
        }
      } catch (err) {
        console.error('Failed to load queues for scanner:', err)
      }
    }
    loadQueues()
    return () => { cancelled = true }
  }, [])

  // ─── Hydrate scanned-result name from queue list when scan only gave us an id
  const hydrateQueueName = useCallback(async (queueId: string, fallback?: string): Promise<string> => {
    if (fallback) return fallback
    const known = availableQueues.find((q) => q.id === queueId)
    if (known) return known.name
    try {
      const result = await apiClient.getQueue(queueId)
      if (result.success && result.data) return result.data.name
    } catch { /* swallow */ }
    return 'Queue'
  }, [availableQueues])

  // ─── CAMERA SCAN ─────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }, [])

  // Tick — runs once per frame while camera is active. Pulls a frame, runs jsQR.
  const decodeFrameLoop = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(decodeFrameLoop)
      return
    }
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      rafRef.current = requestAnimationFrame(decodeFrameLoop)
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    })
    if (code && code.data) {
      const parsed = parseQrPayload(code.data)
      if (parsed.kind === 'queue') {
        stopCamera()
        ;(async () => {
          const queueName = await hydrateQueueName(parsed.queueId, parsed.queueName)
          setScannedResult({ queueId: parsed.queueId, queueName })
          toast.success('QR code detected')
        })()
        return
      }
      if (parsed.kind === 'token') {
        // It's the user's own ticket QR — route to view/manage that token.
        stopCamera()
        handleScannedToken(parsed.tokenId)
        return
      }
      // unknown payload — keep scanning silently
    }
    rafRef.current = requestAnimationFrame(decodeFrameLoop)
  }, [stopCamera, hydrateQueueName, handleScannedToken])

  const startCamera = useCallback(async () => {
    setError(null)
    setInfo(null)
    setScannedResult(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser. Try uploading a QR image instead.')
      return
    }
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch (firstErr) {
        const name = (firstErr as { name?: string })?.name
        if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        } else {
          throw firstErr
        }
      }
      streamRef.current = stream
      // Render the <video> first; the post-mount effect below attaches the
      // stream and kicks off the decode loop. Setting srcObject on a ref that
      // hasn't mounted yet is the bug that produced the "blue border, black
      // inside" symptom.
      setCameraActive(true)
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Camera access was denied. Allow camera access in your browser, or upload a QR image instead.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera was found on this device. Upload a QR image to continue.')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('Camera is in use by another app. Close other tabs/apps and try again.')
      } else {
        setError('Could not start the camera. Try uploading a QR image instead.')
      }
    }
  }, [])

  // Attach the stream once the <video> element actually mounts. Same pattern
  // as the admin-scanner — avoids the race where srcObject is set on a null ref.
  useEffect(() => {
    if (!cameraActive) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return

    video.srcObject = stream
    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => { /* autoplay can fail silently */ })
    }
    rafRef.current = requestAnimationFrame(decodeFrameLoop)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [cameraActive, decodeFrameLoop])

  // Stop the camera if the user navigates away
  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // ─── IMAGE UPLOAD DECODE ─────────────────────────────────
  const decodeImageFile = useCallback(async (file: File) => {
    setError(null)
    setInfo(null)
    setScannedResult(null)
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPG, GIF, WEBP).')
      return
    }
    setDecoding(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(file)
      })

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('image load failed'))
        i.src = dataUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setError('Could not read the image. Try a different file.')
        return
      }
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      })
      if (!code || !code.data) {
        setError('Couldn’t find a QR code in that image. Try a clearer photo, or use the camera.')
        return
      }
      const parsed = parseQrPayload(code.data)
      if (parsed.kind === 'queue') {
        const queueName = await hydrateQueueName(parsed.queueId, parsed.queueName)
        setScannedResult({ queueId: parsed.queueId, queueName })
        toast.success('QR code decoded successfully')
        return
      }
      if (parsed.kind === 'token') {
        handleScannedToken(parsed.tokenId)
        return
      }
      setError('That QR is not a QueueSeva queue or token.')
    } catch {
      setError('Failed to read the image. Try another file.')
    } finally {
      setDecoding(false)
    }
  }, [hydrateQueueName, handleScannedToken])

  const handleFilePicked = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await decodeImageFile(file)
    // Reset so the same file can be picked twice in a row
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [decodeImageFile])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await decodeImageFile(file)
  }, [decodeImageFile])

  // ─── MANUAL CODE ENTRY ──────────────────────────────────
  const handleManualJoin = async () => {
    setError(null)
    setInfo(null)
    if (!manualCode.trim()) {
      setError('Please enter a queue code.')
      return
    }
    const parsed = parseQrPayload(manualCode.trim())
    if (parsed.kind === 'token') {
      // user pasted their own signed token QR — route to view it
      handleScannedToken(parsed.tokenId)
      return
    }
    const queueId = parsed.kind === 'queue' ? parsed.queueId : manualCode.trim()
    try {
      const result = await apiClient.getQueue(queueId)
      if (result.success && result.data) {
        setSelectedQueue(result.data)
        navigate('queue-detail')
      } else {
        setError('Queue not found. Check the code and try again.')
      }
    } catch {
      setError('Failed to find queue. Please try again.')
    }
  }

  // ─── JOIN A SCANNED QUEUE ──────────────────────────────
  const handleJoinScanned = async () => {
    if (!scannedResult || !user) return
    setJoining(true)
    setError(null)
    try {
      const result = await apiClient.joinQueue(scannedResult.queueId)
      if (result.success && result.data) {
        const token = result.data
        const enriched = { ...token, queueName: scannedResult.queueName }
        setSelectedToken(enriched)
        setUserTokens([...userTokens, enriched])
        emitRefresh('queue-update')
        emitRefresh('token-update')
        toast.success(`Joined "${scannedResult.queueName}" — Token ${token.tokenNumber}`)
        navigate('token-display')
      } else {
        setError(result.error || 'Failed to join queue.')
      }
    } catch {
      setError('Something went wrong while joining the queue.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title="QR Scanner" subtitle="Scan or upload a queue QR code" showQr={false} />

      <main className="flex flex-1 flex-col items-center p-4 sm:p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Scanner / camera area */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-slate-700 bg-slate-900/50"
          >
            {scannedResult ? (
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
                <div className="flex gap-2">
                  <Button
                    onClick={handleJoinScanned}
                    disabled={joining}
                    className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                  >
                    {joining ? 'Joining…' : 'Join Queue'}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setScannedResult(null)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Re-scan
                  </Button>
                </div>
              </motion.div>
            ) : cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                {/* Crop frame overlay */}
                <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-[#4F46E5]/70">
                  <motion.div
                    className="absolute left-0 right-0 h-0.5 bg-[#4F46E5]"
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-[#4F46E5]" />
                  <div className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-[#4F46E5]" />
                  <div className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-[#4F46E5]" />
                  <div className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-[#4F46E5]" />
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white backdrop-blur"
                >
                  <StopCircle className="h-4 w-4" />
                  Stop camera
                </button>
              </>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center transition-colors ${
                  dragActive ? 'bg-[#4F46E5]/10' : ''
                }`}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800/50">
                  {decoding ? (
                    <ScanLine className="h-10 w-10 animate-pulse text-[#4F46E5]" />
                  ) : (
                    <Camera className="h-10 w-10 text-slate-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    {decoding ? 'Reading QR code…' : 'Scan or upload a QR code'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {dragActive ? 'Drop the image to decode it' : 'Use your camera, or drag a QR image here'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    onClick={startCamera}
                    disabled={decoding}
                    className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                  >
                    <ScanLine className="mr-2 h-4 w-4" />
                    Start camera
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={decoding}
                    className="border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload image
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFilePicked}
                  />
                </div>
              </div>
            )}
          </motion.div>

          {/* Manual entry */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-800" />
              <span className="text-xs text-slate-600">or enter queue code</span>
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
              {info && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {info}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-2">
              <Input
                placeholder="Paste queue code…"
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

          {/* Quick join shortcuts */}
          {availableQueues.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="space-y-2"
            >
              <h3 className="text-xs font-medium text-slate-500">Active queues</h3>
              <div className="space-y-2">
                {availableQueues.slice(0, 4).map((queue) => (
                  <button
                    key={queue.id}
                    onClick={() => {
                      setSelectedQueue(queue)
                      navigate('queue-detail')
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-800/30 bg-slate-900/20 p-3 text-left transition-colors hover:bg-slate-800/30"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4F46E5]/10 text-xs font-bold text-[#4F46E5]">
                      {queue.prefix}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-300">{queue.name}</p>
                      <p className="text-[10px] text-slate-500">{queue.currentLength} in queue</p>
                    </div>
                    <ArrowRight className="h-3 w-3 text-slate-600" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Empty placeholder if no queues */}
          {availableQueues.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-800/30 bg-slate-900/20 p-3 text-xs text-slate-500">
              <ImageIcon className="h-4 w-4" />
              No active queues right now. Ask an admin to open one.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
