'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera,
  ScanLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  StopCircle,
  Loader2,
  ShieldCheck,
  History,
} from 'lucide-react'
import jsQR from 'jsqr'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'
import { Header } from './header'
import { Button } from '@/components/ui/button'
import { UserAvatar } from './user-avatar'
import { toast } from 'sonner'

// ─── REASON CODE → HUMAN COPY ─────────────────────────
// Mirrors the structured reason codes returned by /api/token/validate.
function describeReason(reason?: string): { label: string; tone: 'error' | 'warn' } {
  switch (reason) {
    case 'INVALID_PAYLOAD':
      return { label: 'Not a QueueSeva QR code', tone: 'error' }
    case 'INVALID_SIGNATURE':
      return { label: 'QR signature invalid (possible forgery)', tone: 'error' }
    case 'TOKEN_NOT_FOUND':
      return { label: 'Token does not exist', tone: 'error' }
    case 'LEGACY_TOKEN':
      return { label: 'Token predates QR validation. Use admin token controls instead.', tone: 'warn' }
    case 'EXPIRED':
      return { label: 'QR has expired', tone: 'warn' }
    case 'ALREADY_CONSUMED':
      return { label: 'QR has already been used', tone: 'warn' }
    case 'WRONG_STATUS':
      return { label: 'Token is no longer in a valid state', tone: 'warn' }
    default:
      return { label: 'QR could not be validated', tone: 'error' }
  }
}

interface ScanLogEntry {
  id: string
  at: string
  ok: boolean
  reason?: string
  tokenNumber?: string
  userName?: string
  userAvatar?: string | null
}

export function AdminScannerScreen() {
  const { navigate, user } = useAppStore()

  const [cameraActive, setCameraActive] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [validating, setValidating] = useState(false)
  const [lastResult, setLastResult] = useState<
    | null
    | { ok: true; tokenNumber: string; userName?: string; userAvatar?: string | null; counterName?: string }
    | { ok: false; reason: string; tokenNumber?: string }
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<ScanLogEntry[]>([])
  const [dragActive, setDragActive] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inFlightRef = useRef<string | null>(null) // prevent duplicate validation of the same payload

  // Guard: this screen is admin-only. Bounce non-admins back to the dashboard.
  useEffect(() => {
    if (!user) return
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      navigate('dashboard')
    }
  }, [user, navigate])

  // ─── CALL THE BACKEND ──────────────────────────────────
  const validate = useCallback(async (qrPayload: string) => {
    if (inFlightRef.current === qrPayload) return // already validating this exact payload
    inFlightRef.current = qrPayload
    setValidating(true)
    setError(null)
    try {
      const result = await apiClient.validateQrToken(qrPayload)
      if (!result.success || !result.data) {
        setError(result.error || 'Validation request failed')
        setLastResult({ ok: false, reason: 'NETWORK' })
        toast.error(result.error || 'Validation failed')
        return
      }
      const data = result.data
      const entry: ScanLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        ok: data.valid,
        reason: data.reason,
        tokenNumber: data.tokenNumber,
        userName: data.user?.name,
        userAvatar: data.user?.avatar ?? null,
      }
      setRecent((prev) => [entry, ...prev].slice(0, 10))
      if (data.valid) {
        setLastResult({
          ok: true,
          tokenNumber: data.tokenNumber || '',
          userName: data.user?.name,
          userAvatar: data.user?.avatar ?? null,
          counterName: data.counter?.name,
        })
        toast.success(`Validated ${data.tokenNumber}`)
      } else {
        setLastResult({ ok: false, reason: data.reason || 'UNKNOWN', tokenNumber: data.tokenNumber })
        const desc = describeReason(data.reason)
        toast.error(desc.label)
      }
    } catch (err) {
      setError((err as Error).message || 'Network error')
      setLastResult({ ok: false, reason: 'NETWORK' })
    } finally {
      setValidating(false)
      // Allow re-validation of the same payload after 1.5s — keeps repeated
      // accidental scans from re-firing while still letting an admin re-try
      // after a network error.
      setTimeout(() => {
        if (inFlightRef.current === qrPayload) inFlightRef.current = null
      }, 1500)
    }
  }, [])

  // ─── CAMERA ─────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }, [])

  const decodeFrameLoop = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(decodeFrameLoop)
      return
    }
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
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
    if (code && code.data && inFlightRef.current !== code.data) {
      // Don't stop the camera — admin may scan a stream of users.
      validate(code.data)
    }
    rafRef.current = requestAnimationFrame(decodeFrameLoop)
  }, [validate])

  const startCamera = useCallback(async () => {
    setError(null)
    setLastResult(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser. Use the upload option instead.')
      return
    }
    try {
      // Try environment-facing camera first (mobile rear), then fall back
      // explicitly to user-facing (laptops without a rear camera), then to
      // unconstrained video as a last resort.
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch (firstErr) {
        const name = (firstErr as { name?: string })?.name
        if (
          name === 'OverconstrainedError' ||
          name === 'ConstraintNotSatisfiedError' ||
          name === 'NotFoundError'
        ) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user' },
              audio: false,
            })
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          }
        } else {
          throw firstErr
        }
      }
      streamRef.current = stream
      // Switch UI mode FIRST so the <video> element gets mounted, then attach
      // the stream from the post-mount effect below. Setting srcObject on a
      // ref that hasn't been committed to the DOM is the bug that produced
      // the "blue border with black inside" symptom.
      setCameraActive(true)
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Camera access was denied. Allow camera in your browser, or upload an image.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera found on this device. Use the upload option.')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('Camera is in use by another app. Close other tabs/apps and try again.')
      } else {
        setError('Could not start the camera. Use the upload option.')
      }
    }
  }, [])

  // Attach the stream to the <video> the moment it mounts. Also kick off the
  // decode loop. Cleans up if cameraActive flips back to false.
  useEffect(() => {
    if (!cameraActive) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return

    video.srcObject = stream
    // Some browsers (Safari, in-app webviews) require play() to be called
    // explicitly even with autoplay/muted. We swallow rejections because
    // they're informational on this code path — the video will still render
    // once it can.
    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => { /* autoplay rejection is fine */ })
    }

    rafRef.current = requestAnimationFrame(decodeFrameLoop)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [cameraActive, decodeFrameLoop])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // ─── IMAGE UPLOAD ───────────────────────────────────────
  const decodeImageFile = useCallback(
    async (file: File) => {
      setError(null)
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
          setError('Could not read the image.')
          return
        }
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        })
        if (!code || !code.data) {
          setError('Couldn’t find a QR code in that image. Try a clearer photo.')
          return
        }
        await validate(code.data)
      } catch {
        setError('Failed to read the image.')
      } finally {
        setDecoding(false)
      }
    },
    [validate],
  )

  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) await decodeImageFile(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [decodeImageFile],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const file = e.dataTransfer.files?.[0]
      if (file) await decodeImageFile(file)
    },
    [decodeImageFile],
  )

  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header title="Admin Scanner" subtitle="Validate single-use queue QR codes" showQr={false} />

      <main className="flex flex-1 flex-col items-center p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6">
          {/* Status banner — very deliberate so admins can confirm at a glance */}
          <AnimatePresence mode="wait">
            {lastResult && (
              <motion.div
                key={lastResult.ok ? `ok-${lastResult.tokenNumber}` : `bad-${lastResult.reason}`}
                initial={{ opacity: 0, y: -10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className={
                  lastResult.ok
                    ? 'rounded-2xl border-2 border-emerald-500/60 bg-emerald-500/10 p-4 shadow-lg shadow-emerald-500/20'
                    : describeReason(lastResult.reason).tone === 'warn'
                      ? 'rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 p-4'
                      : 'rounded-2xl border-2 border-red-500/60 bg-red-500/10 p-4'
                }
              >
                {lastResult.ok ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                        Validated
                      </p>
                      <p className="text-2xl font-black text-white">{lastResult.tokenNumber}</p>
                      {(lastResult.userName || lastResult.counterName) && (
                        <p className="mt-1 truncate text-xs text-slate-300">
                          {lastResult.userName ? `${lastResult.userName} • ` : ''}
                          {lastResult.counterName || 'No counter assigned'}
                        </p>
                      )}
                    </div>
                    <UserAvatar
                      name={lastResult.userName}
                      src={lastResult.userAvatar}
                      className="h-12 w-12 shrink-0"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {describeReason(lastResult.reason).tone === 'warn' ? (
                      <AlertTriangle className="h-8 w-8 text-amber-400" />
                    ) : (
                      <XCircle className="h-8 w-8 text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Rejected{lastResult.tokenNumber ? ` — ${lastResult.tokenNumber}` : ''}
                      </p>
                      <p className="text-base font-semibold text-white">
                        {describeReason(lastResult.reason).label}
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scanner area */}
          <div
            className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed bg-slate-900/50 transition-colors ${
              dragActive ? 'border-[#4F46E5] bg-[#4F46E5]/10' : 'border-slate-700'
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
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
                  Stop
                </button>
                {validating && (
                  <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-[10px] font-medium text-white backdrop-blur">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Validating
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 p-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800/50">
                  {decoding || validating ? (
                    <ScanLine className="h-10 w-10 animate-pulse text-[#4F46E5]" />
                  ) : (
                    <Camera className="h-10 w-10 text-slate-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    {decoding ? 'Decoding image…' : validating ? 'Validating…' : 'Scan or upload a token QR'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {dragActive ? 'Drop the QR image to validate' : 'Camera or image upload — both work'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    onClick={startCamera}
                    disabled={decoding || validating}
                    className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                  >
                    <ScanLine className="mr-2 h-4 w-4" />
                    Start camera
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={decoding || validating}
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
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Recent scans */}
          <div className="rounded-2xl border border-slate-800/50 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <History className="h-3.5 w-3.5" />
              Recent scans
              <span className="ml-auto inline-flex items-center gap-1 text-emerald-400 normal-case tracking-normal">
                <ShieldCheck className="h-3 w-3" />
                Single-use
              </span>
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-slate-600">No scans yet. Scan a token QR to validate it.</p>
            ) : (
              <ul className="divide-y divide-slate-800/40">
                {recent.map((entry) => {
                  const desc = describeReason(entry.reason)
                  return (
                    <li key={entry.id} className="flex items-center gap-3 py-2.5">
                      {entry.ok ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : desc.tone === 'warn' ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-200">
                          {entry.tokenNumber || (entry.ok ? 'Valid' : 'Invalid')}
                          {entry.userName ? ` — ${entry.userName}` : ''}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {entry.ok ? 'Consumed' : desc.label}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-slate-600">
                        {new Date(entry.at).toLocaleTimeString()}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
