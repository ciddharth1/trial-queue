'use client'

import { useState } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { apiClient } from '@/lib/api-client'

interface GoogleSignInButtonProps {
  /** Called after a successful sign-in & store hydration. */
  onSuccess?: () => void
  /** Called on any error (Google error, server error, network error). */
  onError?: (message: string) => void
  /** Render text — Google requires the text to be one of these values. */
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  /** Disabled state shown while a sibling form is busy. */
  disabled?: boolean
}

const NOT_CONFIGURED_MESSAGE =
  'Google sign-in is coming soon. Use email & password to continue.'

const TEXT_MAP: Record<NonNullable<GoogleSignInButtonProps['text']>, string> = {
  signin_with: 'Sign in with Google',
  signup_with: 'Sign up with Google',
  continue_with: 'Continue with Google',
  signin: 'Sign in with Google',
}

/**
 * Google Sign-In button using Google Identity Services (GIS) via @react-oauth/google.
 * Returns a Google ID token that we POST to our own /api/auth/google endpoint;
 * the server verifies the token, finds-or-creates the user, and issues our JWT pair.
 *
 * When NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set, we render a styled placeholder so
 * the layout is consistent and the developer can see where the button lives.
 */
export function GoogleSignInButton({
  onSuccess,
  onError,
  text = 'continue_with',
  disabled = false,
}: GoogleSignInButtonProps) {
  const setAuth = useAppStore((s) => s.setAuth)
  const navigate = useAppStore((s) => s.navigate)
  const [loading, setLoading] = useState(false)

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  const handleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      onError?.('Google did not return a credential. Please try again.')
      return
    }
    setLoading(true)
    try {
      const result = await apiClient.loginWithGoogle(response.credential)
      if (!result.success || !result.data) {
        onError?.(result.error || 'Google sign-in failed. Please try again.')
        return
      }
      apiClient.setAccessToken(result.data.accessToken)
      setAuth(result.data.user, result.data.accessToken, result.data.refreshToken)
      navigate(result.data.user.role === 'ADMIN' ? 'admin-dashboard' : 'dashboard')
      onSuccess?.()
    } catch (err) {
      onError?.((err as Error)?.message || 'Network error during Google sign-in.')
    } finally {
      setLoading(false)
    }
  }

  const handleError = () => {
    onError?.('Google sign-in was cancelled or failed.')
  }

  // ─── Configured: render the real Google button ───────────────────────
  if (clientId) {
    return (
      <div className="relative flex w-full items-center justify-center" data-testid="google-signin">
        <div className={loading || disabled ? 'pointer-events-none opacity-60' : ''}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            text={text}
            theme="filled_black"
            shape="pill"
            size="large"
            width={320}
            logo_alignment="left"
            useOneTap={false}
          />
        </div>

        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
            <span className="ml-2 text-xs font-medium text-white">Signing you in…</span>
          </div>
        )}
      </div>
    )
  }

  // ─── Not configured: styled placeholder so the layout is intact ──────
  return (
    <button
      type="button"
      onClick={() => {
        // Show a friendly toast instead of dumping into the form's error banner.
        toast.info('Google sign-in is coming soon', {
          description: 'Use email & password for now, or ask the admin to enable Google sign-in.',
        })
      }}
      disabled={disabled}
      className="group flex h-11 w-full max-w-[320px] items-center justify-center gap-3 rounded-full border border-slate-700 bg-slate-900 px-5 text-sm font-medium text-white shadow-md transition-all hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
      title="Google sign-in is coming soon"
      data-testid="google-signin-placeholder"
    >
      <GoogleLogo className="h-5 w-5" />
      <span>{TEXT_MAP[text]}</span>
    </button>
  )
}

/** Inline Google "G" mark — official 4-color logo. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}
