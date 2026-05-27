import { OAuth2Client } from 'google-auth-library'

// ─── GOOGLE ID TOKEN VERIFICATION ─────────────────────────
// We verify Google ID tokens server-side using the official google-auth-library.
// This validates the token's signature, issuer, audience (our client ID), and
// expiry — never trust raw client claims.

let cachedClient: OAuth2Client | null = null

export interface GoogleProfile {
  sub: string // stable Google user id
  email: string
  emailVerified: boolean
  name: string
  picture: string | null
}

export function getGoogleClientId(): string | null {
  // Prefer the server-only client id; fall back to the public one (which the
  // frontend also uses) so admins only need to configure it once.
  return (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    null
  )
}

export function isGoogleAuthConfigured(): boolean {
  return getGoogleClientId() !== null
}

function getClient(): OAuth2Client {
  if (cachedClient) return cachedClient
  const clientId = getGoogleClientId()
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID (or NEXT_PUBLIC_GOOGLE_CLIENT_ID) is not configured')
  }
  cachedClient = new OAuth2Client(clientId)
  return cachedClient
}

/**
 * Verify a Google ID token and return a normalised profile.
 * Throws on invalid token, mismatched audience, expired token, or unverified email.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const client = getClient()
  const audience = getGoogleClientId()!

  const ticket = await client.verifyIdToken({
    idToken,
    audience,
  })

  const payload = ticket.getPayload()
  if (!payload) {
    throw new Error('Invalid Google ID token (no payload)')
  }
  if (!payload.sub) {
    throw new Error('Invalid Google ID token (missing subject)')
  }
  if (!payload.email) {
    throw new Error('Invalid Google ID token (missing email)')
  }
  if (!payload.email_verified) {
    throw new Error('Google account email is not verified')
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || null,
  }
}
