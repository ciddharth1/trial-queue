'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { motion } from 'framer-motion'
import { ShieldCheck, Clock, AlertTriangle, Loader2, CheckCircle2, RotateCw } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

interface TokenQrCardProps {
  /** ID of the token whose QR we want to render. */
  tokenId: string
  /** Initial expiry from the parent (used to render the countdown immediately). */
  initialExpiresAt?: string | null
  /** When true, the QR is dimmed and a "consumed" badge is shown. */
  consumed?: boolean
  /** Auto-refresh the qrPayload every 60s by re-fetching the token (catches token expiry / status changes). */
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
  initialExpiresAt,
  consumed,
  refreshIntervalMs = 60_000,
}: TokenQrCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<QrFetchState>({ kind: 'loading' })
  const [now, setNow] = useState(Date.now())

  // Tick once a second so the countdown updates
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  void now // referenced via useEffect re-render

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
          // Backend deliberately omits the QR for tokens that are no longer usable.
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

      {/* Footer — TTL countdown + integrity badge */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Single-use signed QR
        </div>
        {state.kind === 'ready' && state.expiresAt && (
          <div className="flex items-center gap-1.5 font-mono text-slate-600" title={new Date(state.expiresAt).toLocaleString()}>
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
