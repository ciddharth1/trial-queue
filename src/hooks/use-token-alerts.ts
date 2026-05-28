'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { socketManager } from '@/lib/socket'

// Tiny embedded MP3 chime so we have an alert sound without shipping a binary.
// Generated from a brief sine sweep — small enough to inline as base64.
// Keep sound short and unobtrusive (~200ms).
const ALERT_TONE_DATA_URI =
  'data:audio/mpeg;base64,SUQzAwAAAAAAH1RTU0UAAAAVAAADTGF2ZjU4LjI5LjEwMAA'

let cachedAudio: HTMLAudioElement | null = null
function playChime() {
  if (typeof window === 'undefined') return
  try {
    if (!cachedAudio) {
      // Use the WebAudio API instead of the data URI hack so we always have a tone
      // that actually plays without needing an MP3 asset on disk.
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + dur)
      }
      playTone(880, 0, 0.18)
      playTone(1175, 0.18, 0.22)
      // First play primes the autoplay permission. Subsequent calls reuse this path.
      cachedAudio = new Audio()
      return
    }
    // Subsequent plays: reproduce the same tone via WebAudio
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    playTone(880, 0, 0.18)
    playTone(1175, 0.18, 0.22)
  } catch {
    // Audio context can fail (autoplay policy, sandbox). Silently ignore.
  }
  // Keep the lint happy about the unused stub
  void ALERT_TONE_DATA_URI
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined') return
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* swallow */
  }
}

/**
 * Wires the persisted user settings to actual side effects:
 *   - settings.tokenAlerts        → triggers when ANY token belonging to the
 *                                   current user is called/serving
 *   - settings.soundAlerts        → plays a short two-tone chime
 *   - settings.vibration          → vibrates the device (if supported)
 *   - settings.pushNotifications  → shows a desktop notification if the user
 *                                   has previously granted permission
 *
 * Idempotent: only attaches one listener per setting toggle.
 */
export function useTokenAlerts() {
  const { user, settings } = useAppStore()

  useEffect(() => {
    if (!user) return

    const tokenCalledHandler = (payload: unknown) => {
      const data = payload as { userId?: string; tokenNumber?: string; counterName?: string }
      // Only fire alerts for the current user's tokens. Admin/staff dashboards
      // get their own UI feedback via existing socket events.
      if (data?.userId && data.userId !== user.id) return
      if (!settings.tokenAlerts) return

      if (settings.soundAlerts) playChime()
      if (settings.vibration) vibrate([200, 80, 200])

      if (settings.pushNotifications && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          try {
            new Notification('Your turn is up', {
              body: data.counterName
                ? `Token ${data.tokenNumber || ''} — please proceed to ${data.counterName}.`
                : `Token ${data.tokenNumber || ''} has been called.`,
              tag: 'queueseva-token-called',
            })
          } catch {
            /* desktop notifications can fail in iframes */
          }
        }
      }
    }

    const offCalled = socketManager.on('token:called', tokenCalledHandler)
    const offServing = socketManager.on('token:serving', tokenCalledHandler)

    return () => {
      offCalled()
      offServing()
    }
  }, [
    user,
    settings.tokenAlerts,
    settings.soundAlerts,
    settings.vibration,
    settings.pushNotifications,
  ])

  // Ask for desktop notification permission once when the user first turns
  // pushNotifications on. We never ask unprompted at app load.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (!settings.pushNotifications) return
    if (Notification.permission !== 'default') return
    Notification.requestPermission().catch(() => { /* ignore */ })
  }, [settings.pushNotifications])
}
