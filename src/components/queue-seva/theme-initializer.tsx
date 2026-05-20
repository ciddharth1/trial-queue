'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'

/**
 * ThemeInitializer - Syncs the Zustand store theme with the DOM
 * Must be rendered in the client-side component tree
 */
export function ThemeInitializer() {
  const theme = useAppStore((s) => s.theme)

  useEffect(() => {
    // Set initial theme class on <html>
    document.documentElement.className = theme
  }, [theme])

  return null
}
