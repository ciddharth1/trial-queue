'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'

/**
 * Wraps the app in Google's OAuth provider only when NEXT_PUBLIC_GOOGLE_CLIENT_ID
 * is configured. Without a client id the children render unchanged so the rest
 * of the app keeps working.
 */
export function AppGoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) {
    return <>{children}</>
  }
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
}
