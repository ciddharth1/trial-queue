'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  name?: string | null
  email?: string | null
  src?: string | null
  /** tailwind size classes, e.g. 'h-9 w-9' */
  className?: string
  /** override font size for the initial fallback */
  textClassName?: string
}

/**
 * Avatar with image-or-initial fallback.
 * - Renders `src` when provided and the image hasn't errored.
 * - Falls back to a gradient circle with the user's first initial.
 *
 * We use a plain <img> rather than next/image because Google profile picture
 * URLs come from `lh3.googleusercontent.com` which is already in our remote
 * patterns, but plain <img> avoids extra config and works in the standalone
 * server output reliably.
 */
export function UserAvatar({ name, email, src, className, textClassName }: UserAvatarProps) {
  const [errored, setErrored] = useState(false)
  const showImage = !!src && !errored
  const initial = (name?.trim()?.[0] || email?.trim()?.[0] || 'U').toUpperCase()

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#4F46E5] to-[#06B6D4] text-white shadow-md',
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={name || email || 'User'}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className={cn('font-bold', textClassName || 'text-sm')}>{initial}</span>
      )}
    </div>
  )
}
