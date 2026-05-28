'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'

/**
 * Reflects the persisted user settings into the DOM so CSS / global UI can
 * react. We add three classes to <html>:
 *   - "dark" or "light"        — theme
 *   - "compact"                — settings.compactView (denser layouts)
 *   - "live-tracking-disabled" — settings.liveTracking off (suppress motion-heavy
 *                                live components when the user has opted out)
 *
 * Components that care can use `:where(html.compact) ...` selectors. We don't
 * try to retrofit every screen — this is a minimal but real wiring.
 */
export function ThemeInitializer() {
  const theme = useAppStore((s) => s.theme)
  const settings = useAppStore((s) => s.settings)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const cls: string[] = [theme]
    if (settings.compactView) cls.push('compact')
    if (!settings.liveTracking) cls.push('live-tracking-disabled')
    document.documentElement.className = cls.join(' ')
  }, [theme, settings.compactView, settings.liveTracking])

  return null
}
