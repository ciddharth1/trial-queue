import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format wait time from seconds to a human-readable string.
 * Returns values like "2m", "1h 30m", "Just now"
 */
export function formatWaitTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}
