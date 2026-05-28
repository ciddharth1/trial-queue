'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { socketManager } from '@/lib/socket'

// ─── AUDIO CONTEXT UNLOCK (browsers block autoplay until user gesture) ────
// Browsers (especially Safari/iOS and Chrome's autoplay policy) refuse to
// produce sound from a freshly-created AudioContext until the page has
// received a real user gesture (click / keydown / touchstart). We create one
// shared context and resume() it on the first gesture. After that, every
// later token:called event can play through this same context immediately.

type WebAudioWindow = Window & { webkitAudioContext?: typeof AudioContext }

let sharedCtx: AudioContext | null = null
let unlocked = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!sharedCtx) {
    try {
      const Ctor = window.AudioContext || (window as WebAudioWindow).webkitAudioContext
      if (!Ctor) return null
      sharedCtx = new Ctor()
    } catch {
      return null
    }
  }
  return sharedCtx
}

function unlockAudio() {
  if (unlocked) return
  const ctx = getCtx()
  if (!ctx) return
  // resume() is what actually flips the context out of "suspended" state.
  ctx.resume().then(() => {
    unlocked = true
    // Play a near-silent buffer to confirm the unlock — some browsers stay
    // suspended until they actually hear audio output triggered by the gesture.
    try {
      const buffer = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(ctx.destination)
      src.start(0)
    } catch { /* swallow */ }
    console.info('[alerts] AudioContext unlocked')
  }).catch((err) => {
    console.warn('[alerts] AudioContext.resume() failed:', err)
  })
}

// Wire one-shot listeners on first user gesture. Idempotent: removes itself.
function installAudioUnlockListeners() {
  if (typeof window === 'undefined') return
  if (unlocked) return
  const handler = () => {
    unlockAudio()
    if (unlocked) {
      window.removeEventListener('click', handler, true)
      window.removeEventListener('keydown', handler, true)
      window.removeEventListener('touchstart', handler, true)
    }
  }
  window.addEventListener('click', handler, true)
  window.addEventListener('keydown', handler, true)
  window.addEventListener('touchstart', handler, true)
}

function playChime() {
  const ctx = getCtx()
  if (!ctx) {
    console.warn('[alerts] No AudioContext available — cannot play chime')
    return
  }
  // If still suspended, queue the play AND attempt to resume (best effort).
  if (ctx.state === 'suspended') {
    console.warn('[alerts] AudioContext is suspended — chime may be silent until user clicks')
    ctx.resume().catch(() => { /* swallow */ })
  }
  try {
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    // Two-tone "ding-dong" for clarity, slightly louder + longer than before.
    playTone(880, 0, 0.22)
    playTone(1175, 0.22, 0.28)
    playTone(880, 0.55, 0.22)
    playTone(1175, 0.77, 0.28)
    console.info('[alerts] Chime played')
  } catch (err) {
    console.warn('[alerts] Failed to play chime:', err)
  }
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined') return
  if (typeof navigator.vibrate !== 'function') return
  try {
    const ok = navigator.vibrate(pattern)
    console.info('[alerts] navigator.vibrate ->', ok)
  } catch (err) {
    console.warn('[alerts] vibrate failed:', err)
  }
}

/**
 * Persisted user settings → real side effects:
 *   - settings.tokenAlerts        → master switch
 *   - settings.soundAlerts        → WebAudio chime (after first user gesture)
 *   - settings.vibration          → navigator.vibrate
 *   - settings.pushNotifications  → desktop Notification API
 *
 * Plus: shows a centered "It's your turn!" overlay (driven via Zustand) so the
 * user gets unmissable visual feedback even if the tab is muted.
 */
export function useTokenAlerts() {
  const user = useAppStore((s) => s.user)
  const settings = useAppStore((s) => s.settings)
  const setActiveAlert = useAppStore((s) => s.setActiveAlert)

  // Install audio-unlock listeners on first mount so by the time the user
  // does *anything* in the app, audio is ready.
  useEffect(() => {
    installAudioUnlockListeners()
  }, [])

  useEffect(() => {
    if (!user) return

    const tokenCalledHandler = (payload: unknown) => {
      const data = payload as {
        userId?: string
        tokenNumber?: string
        counterName?: string
        queueId?: string
      }

      console.info('[alerts] token:called received', data)

      // Only fire for the current user's own tokens. Admin/staff dashboards
      // get their feedback via separate UI.
      if (data?.userId && data.userId !== user.id) {
        console.info('[alerts] not for this user, skipping')
        return
      }

      if (!settings.tokenAlerts) {
        console.info('[alerts] tokenAlerts disabled in settings, skipping')
        return
      }

      if (settings.soundAlerts) playChime()
      if (settings.vibration) vibrate([300, 100, 300, 100, 300])

      // Push the centered overlay banner. Auto-dismisses after 8s.
      setActiveAlert({
        title: "It's your turn!",
        message: data.counterName
          ? `Token ${data.tokenNumber || ''} — please proceed to ${data.counterName}.`
          : `Your token ${data.tokenNumber || ''} has been called.`,
        tokenNumber: data.tokenNumber,
        counterName: data.counterName,
      })

      if (
        settings.pushNotifications &&
        typeof window !== 'undefined' &&
        'Notification' in window
      ) {
        if (Notification.permission === 'granted') {
          try {
            const n = new Notification('Your turn is up', {
              body: data.counterName
                ? `Token ${data.tokenNumber || ''} — please proceed to ${data.counterName}.`
                : `Token ${data.tokenNumber || ''} has been called.`,
              tag: 'queueseva-token-called',
              requireInteraction: false,
            })
            n.onclick = () => { window.focus(); n.close() }
            console.info('[alerts] Browser Notification shown')
          } catch (err) {
            console.warn('[alerts] Failed to show Notification:', err)
          }
        } else {
          console.info('[alerts] Notification permission not granted:', Notification.permission)
        }
      }
    }

    const offCalled = socketManager.on('token:called', tokenCalledHandler)
    const offServing = socketManager.on('token:serving', tokenCalledHandler)
    console.info('[alerts] Token alert listeners attached for user', user.id)

    return () => {
      offCalled()
      offServing()
      console.info('[alerts] Token alert listeners detached')
    }
  }, [
    user,
    settings.tokenAlerts,
    settings.soundAlerts,
    settings.vibration,
    settings.pushNotifications,
    setActiveAlert,
  ])

  // Ask for browser notification permission once when the user enables it.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    if (!settings.pushNotifications) return
    if (Notification.permission !== 'default') return
    Notification.requestPermission()
      .then((p) => console.info('[alerts] Notification.requestPermission ->', p))
      .catch(() => { /* ignore */ })
  }, [settings.pushNotifications])
}
