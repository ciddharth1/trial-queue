'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import QRCode from 'qrcode'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  RotateCw,
  Download,
  Share2,
  Copy,
  CheckCheck,
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

interface TokenQrCardProps {
  /** ID of the token whose QR we want to render. */
  tokenId: string
  /** Token number for download filename + share copy (e.g. "A-007"). */
  tokenNumber?: string
  /** Optional queue name shown alongside in the share copy. */
  queueName?: string | null
  /** Initial expiry from the parent (used to render the countdown immediately). */
  initialExpiresAt?: string | null
  /** When true, the QR is dimmed and a "consumed" badge is shown. */
  consumed?: boolean
  /** Auto-refresh the qrPayload every 60s by re-fetching the token. */
  refreshIntervalMs?: number
}

type QrFetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: string; expiresAt: string | null; consumedAt: string | null; status: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; message: string }

function formatTimeLeft(target: Date): string {
  const ms = target.getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * Renders the token's secure QR code by fetching the signed `qrPayload` from
 * `/api/token/:id` and drawing it on a <canvas>. The qrPayload is produced
 * server-side via HMAC over the per-token qrSecret + tokenId + expiry, so the
 * client never sees (and never needs) the secret. Consumed tokens render the
 * QR dimmed with a CONSUMED watermark instead of a fresh QR.
 */
export function TokenQrCard({
  tokenId,
  tokenNumber,
  queueName,
  initialExpiresAt,
  consumed,
  refreshIntervalMs = 60_000,
}: TokenQrCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<QrFetchState>({ kind: 'loading' })
  const [, force] = useState(0) // trigger re-render once a second for countdown
  const [busy, setBusy] = useState<'download' | 'share' | 'copy' | null>(null)

  // Tick once a second so the countdown updates
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch + periodically refresh the token's signed payload
  useEffect(() => {
    let cancelled = false

    async function fetchPayload() {
      try {
        const result = await apiClient.getToken(tokenId)
        if (cancelled) return
        if (!result.success || !result.data) {
          setState({ kind: 'error', message: result.error || 'Failed to load token' })
          return
        }
        const data = result.data as unknown as {
          qrPayload?: string | null
          expiresAt?: string | null
          consumedAt?: string | null
          status: string
        }
        if (!data.qrPayload) {
          setState({
            kind: 'unavailable',
            reason: data.consumedAt
              ? 'Token already used'
              : data.status === 'EXPIRED'
                ? 'Token expired'
                : data.status === 'CANCELLED'
                  ? 'Token cancelled'
                  : data.status === 'COMPLETED'
                    ? 'Token completed'
                    : 'QR unavailable',
          })
          return
        }
        setState({
          kind: 'ready',
          payload: data.qrPayload,
          expiresAt: data.expiresAt ?? initialExpiresAt ?? null,
          consumedAt: data.consumedAt ?? null,
          status: data.status,
        })
      } catch (err) {
        if (cancelled) return
        setState({ kind: 'error', message: (err as Error).message || 'Network error' })
      }
    }

    fetchPayload()
    const id = setInterval(fetchPayload, refreshIntervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [tokenId, refreshIntervalMs, initialExpiresAt])

  // Render the QR on the canvas whenever the payload changes
  useEffect(() => {
    if (state.kind !== 'ready') return
    const canvas = canvasRef.current
    if (!canvas) return
    QRCode.toCanvas(canvas, state.payload, {
      width: 240,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    }).catch((err) => {
      console.error('QR render error:', err)
    })
  }, [state])

  // ─── DOWNLOAD / SHARE ──────────────────────────────────
  const buildFilename = useCallback(() => {
    const safeNumber = (tokenNumber || tokenId).replace(/[^a-zA-Z0-9_-]/g, '_')
    return `queueseva-token-${safeNumber}.png`
  }, [tokenNumber, tokenId])

  // Render a higher-resolution QR (with token number caption) on a temp canvas
  // and return it as a Blob suitable for download / Web Share.
  const renderHiResBlob = useCallback(async (): Promise<Blob | null> => {
    if (state.kind !== 'ready') return null
    const size = 720
    const captionHeight = tokenNumber ? 96 : 0
    const off = document.createElement('canvas')
    off.width = size
    off.height = size + captionHeight
    const ctx = off.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, off.width, off.height)
    // Draw the QR centered at high res
    await QRCode.toCanvas(off, state.payload, {
      width: size,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
    if (tokenNumber) {
      // QRCode.toCanvas wipes the canvas — redraw the caption on top.
      // Workaround: render to an OffscreenCanvas-style helper.
      const qrCanvas = document.createElement('canvas')
      qrCanvas.width = size
      qrCanvas.height = size
      await QRCode.toCanvas(qrCanvas, state.payload, {
        width: size,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, off.width, off.height)
      ctx.drawImage(qrCanvas, 0, 0)
      ctx.fillStyle = '#0f172a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 56px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(tokenNumber, size / 2, size + captionHeight / 2 - 6)
      ctx.fillStyle = '#475569'
      ctx.font = '20px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText('QueueSeva', size / 2, size + captionHeight - 18)
    }
    return await new Promise((resolve) => off.toBlob((b) => resolve(b), 'image/png'))
  }, [state, tokenNumber])

  const handleDownload = useCallback(async () => {
    if (state.kind !== 'ready') return
    setBusy('download')
    try {
      const blob = await renderHiResBlob()
      if (!blob) {
        toast.error('Could not render QR for download')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildFilename()
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Defer the revoke so Safari has time to consume the blob.
      setTimeout(() => URL.revokeObjectURL(url), 1500)
      toast.success('QR downloaded')
    } catch (err) {
      console.error('QR download failed:', err)
      toast.error('Failed to download QR')
    } finally {
      setBusy(null)
    }
  }, [state, renderHiResBlob, buildFilename])

  const handleShare = useCallback(async () => {
    if (state.kind !== 'ready') return
    setBusy('share')
    try {
      const blob = await renderHiResBlob()
      if (!blob) {
        toast.error('Could not render QR to share')
        return
      }

      const shareTitle = tokenNumber ? `Token ${tokenNumber}` : 'My queue token'
      const shareText = queueName
        ? `${shareTitle} for "${queueName}" — show this QR at the counter.`
        : `${shareTitle} — show this QR at the counter.`

      // Try Web Share API with file. Supported on most mobile browsers and
      // Safari desktop. Falls back to "copy image to clipboard" on browsers
      // that don't support file shares, then to plain download.
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        const file = new File([blob], buildFilename(), { type: 'image/png' })
        const filePayload = { files: [file], title: shareTitle, text: shareText }
        const canShareFile = (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare
          ? (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare!(filePayload)
          : false
        if (canShareFile) {
          await (navigator as Navigator).share(filePayload)
          toast.success('Shared')
          return
        }
        // Some platforms (older iOS, desktop Chrome) only allow text/url shares.
        try {
          await (navigator as Navigator).share({ title: shareTitle, text: shareText })
          toast.success('Shared')
          return
        } catch {
          /* fall through to clipboard / download */
        }
      }

      // Clipboard image API — Chrome / Edge desktop support it.
      if (typeof navigator !== 'undefined' && 'clipboard' in navigator && 'ClipboardItem' in window) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          toast.success('QR copied to clipboard')
          return
        } catch {
          /* fall through */
        }
      }

      // Last-ditch fallback: trigger a download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildFilename()
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1500)
      toast.info('Sharing not supported here — QR downloaded instead.')
    } catch (err) {
      console.error('QR share failed:', err)
      toast.error('Failed to share QR')
    } finally {
      setBusy(null)
    }
  }, [state, renderHiResBlob, tokenNumber, queueName, buildFilename])

  const handleCopyPayload = useCallback(async () => {
    if (state.kind !== 'ready') return
    setBusy('copy')
    try {
      await navigator.clipboard.writeText(state.payload)
      toast.success('QR payload copied — paste it into the admin scanner')
    } catch {
      toast.error('Could not copy to clipboard')
    } finally {
      setBusy(null)
    }
  }, [state])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/60 bg-white p-5 shadow-xl">
      {/* QR area */}
      <div className="flex items-center justify-center">
        {state.kind === 'loading' && (
          <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl bg-slate-100">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            <p className="text-xs text-slate-500">Generating QR…</p>
          </div>
        )}

        {state.kind === 'unavailable' && (
          <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-700">{state.reason}</p>
            <p className="text-xs text-slate-500">No active QR for this token.</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 text-center">
            <AlertTriangle className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-semibold text-rose-700">{state.message}</p>
          </div>
        )}

        {state.kind === 'ready' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative"
          >
            <canvas ref={canvasRef} className={consumed ? 'opacity-40' : ''} aria-label="Token QR code" />
            {consumed && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rotate-[-12deg] rounded border-2 border-emerald-600 bg-white px-3 py-1 text-sm font-bold text-emerald-700 shadow">
                  CONSUMED
                </span>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Action row — Download / Share / Copy */}
      {state.kind === 'ready' && !consumed && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy !== null}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
            title="Save the QR as a PNG image"
          >
            {busy === 'download' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={busy !== null}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] text-xs font-medium text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50"
            title="Share the QR via your device's share sheet"
          >
            {busy === 'share' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Share2 className="h-3.5 w-3.5" />
            )}
            Share
          </button>
          <button
            type="button"
            onClick={handleCopyPayload}
            disabled={busy !== null}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            title="Copy the signed QR payload (text)"
          >
            {busy === 'copy' ? (
              <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copy
          </button>
        </div>
      )}

      {/* Footer — TTL countdown + integrity badge */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Single-use signed QR
        </div>
        {state.kind === 'ready' && state.expiresAt && (
          <div
            className="flex items-center gap-1.5 font-mono text-slate-600"
            title={new Date(state.expiresAt).toLocaleString()}
          >
            <Clock className="h-3.5 w-3.5" />
            {formatTimeLeft(new Date(state.expiresAt))}
          </div>
        )}
        {state.kind !== 'ready' && (
          <button
            type="button"
            onClick={() => setState({ kind: 'loading' })}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-800"
            title="Retry"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
