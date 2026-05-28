'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'

const ADMIN_IDLE_MS = 30 * 60 * 1000          // log admin out after 30 min idle
const ADMIN_WARNING_MS = 29 * 60 * 1000       // warn 60 seconds before logout
const ADMIN_WARNING_TOAST_ID = 'admin-idle-warning'

// Events we treat as "user is active". keydown is critical so admins typing
// into a long form don't get logged out mid-edit. We use the capture phase so
// we always see them even if a child component stops propagation.
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
  'visibilitychange',
] as const

/**
 * Auto-logout for admin sessions after a period of inactivity.
 *
 * Why admins specifically: the threat model is that an admin walks away from
 * a logged-in machine on a counter or back-office terminal. Regular users
 * have nothing especially privileged behind their session, so we don't
 * impose a UX penalty on them.
 *
 * Mechanics:
 *   1. Listen for any user gesture (mouse/keyboard/touch/scroll) and reset
 *      the idle timer on each one. We throttle resets to once per second
 *      so a moving cursor doesn't fire setTimeout 60 times.
 *   2. At T-60s we show a sticky toast warning the admin they're about to
 *      be signed out, with a "Stay signed in" action that resets the timer.
 *   3. At T+0 we call store.logout() which clears the auth + all user-scoped
 *      caches and routes back to the welcome screen.
 *
 * Visibility (the document.visibilityState change) is treated as activity
 * so an admin tab that's been backgrounded for 25 minutes won't be killed
 * the moment they re-focus it.
 */
export function useInactivityLogout() {
  const user = useAppStore((s) => s.user)
  const logout = useAppStore((s) => s.logout)
  const role = user?.role

  // Timer + last-activity refs survive across renders.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastResetAtRef = useRef<number>(0)

  useEffect(() => {
    if (!user) return
    // Only enforce inactivity logout for admins. Regular users keep the
    // standard JWT TTL flow.
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return

    function clearTimers() {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current)
        warningTimerRef.current = null
      }
    }

    function scheduleLogout() {
      clearTimers()

      warningTimerRef.current = setTimeout(() => {
        toast.warning('You will be signed out in 60 seconds for inactivity.', {
          id: ADMIN_WARNING_TOAST_ID,
          duration: 60_000,
          action: {
            label: 'Stay signed in',
            onClick: () => {
              resetIdleTimer({ force: true })
              toast.dismiss(ADMIN_WARNING_TOAST_ID)
            },
          },
        })
      }, ADMIN_WARNING_MS)

      idleTimerRef.current = setTimeout(() => {
        toast.dismiss(ADMIN_WARNING_TOAST_ID)
        toast.info('Signed out due to inactivity.')
        logout()
      }, ADMIN_IDLE_MS)
    }

    function resetIdleTimer(opts?: { force?: boolean }) {
      // Throttle: don't reset the timer more than once per second on a moving
      // mouse. The `force: true` path bypasses the throttle (used by the
      // "Stay signed in" toast button).
      const now = Date.now()
      if (!opts?.force && now - lastResetAtRef.current < 1000) return
      lastResetAtRef.current = now
      // If the warning toast is already up, dismiss it on real activity.
      toast.dismiss(ADMIN_WARNING_TOAST_ID)
      scheduleLogout()
    }

    function handleEvent(e: Event) {
      // visibilitychange only counts when the document becomes visible.
      if (e.type === 'visibilitychange' && document.visibilityState !== 'visible') return
      resetIdleTimer()
    }

    // Initial schedule on mount.
    scheduleLogout()

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleEvent, { capture: true, passive: true })
    }

    return () => {
      clearTimers()
      toast.dismiss(ADMIN_WARNING_TOAST_ID)
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleEvent, { capture: true })
      }
    }
  }, [user, role, logout])
}
