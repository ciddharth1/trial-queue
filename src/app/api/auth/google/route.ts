import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { generateTokenPair } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'
import { verifyGoogleIdToken, isGoogleAuthConfigured } from '@/lib/google-auth'

// POST /api/auth/google
// Body: { credential: <Google ID token (JWT)> }
// Verifies the Google credential, finds-or-creates the user, and returns the
// same shape as /api/auth/login so the frontend can plug it in unchanged.
export async function POST(request: NextRequest) {
  try {
    if (!isGoogleAuthConfigured()) {
      return errorResponse('Google sign-in is not configured on the server', 503)
    }

    const body = await request.json().catch(() => ({}))
    const credential = typeof body?.credential === 'string' ? body.credential : null
    if (!credential) {
      return errorResponse('Missing Google credential', 400)
    }

    // 1. Verify with Google's public keys (signature, audience, expiry).
    let profile
    try {
      profile = await verifyGoogleIdToken(credential)
    } catch (err) {
      const message = (err as Error).message || 'Invalid Google credential'
      return errorResponse(message, 401)
    }

    // 2. Find existing user by googleId, then by email (link-on-match).
    let user = await db.user.findUnique({ where: { googleId: profile.sub } })

    if (!user) {
      const byEmail = await db.user.findUnique({ where: { email: profile.email } })
      if (byEmail) {
        // Existing local account with same email — link it to the Google identity.
        user = await db.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.sub,
            // Preserve LOCAL provider when a password was already set; otherwise switch to GOOGLE.
            authProvider: byEmail.password ? byEmail.authProvider : 'GOOGLE',
            // Backfill avatar / name if missing.
            avatar: byEmail.avatar || profile.picture,
            name: byEmail.name || profile.name,
          },
        })
      } else {
        // Brand-new user — create with the GOOGLE provider and no password.
        user = await db.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            password: null,
            avatar: profile.picture,
            authProvider: 'GOOGLE',
            googleId: profile.sub,
            isActive: true,
          },
        })
      }
    } else if (profile.picture && profile.picture !== user.avatar) {
      // Refresh avatar each login so it stays in sync with Google.
      user = await db.user.update({
        where: { id: user.id },
        data: { avatar: profile.picture },
      })
    }

    if (!user.isActive) {
      return errorResponse('Account is deactivated', 403)
    }

    // 3. Issue our usual JWT pair.
    const tokenPair = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    // 4. Mirror /auth/login: replace existing sessions, store the new one, update lastLoginAt.
    await db.session.deleteMany({ where: { userId: user.id } })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // refresh token lifetime

    await db.session.create({
      data: {
        userId: user.id,
        token: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt,
      },
    })

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    // Strip the password hash field from the response.
    const { password: _password, ...userWithoutPassword } = user
    void _password

    return successResponse(
      {
        user: userWithoutPassword,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
      },
      'Google sign-in successful',
    )
  } catch (error) {
    console.error('Google sign-in error:', error)
    return errorResponse('Internal server error', 500)
  }
}
