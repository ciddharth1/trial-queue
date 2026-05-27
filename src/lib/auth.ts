import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from '@/types'

// ─── JWT SECRET VALIDATION ──────────────────────────────
// Validate at module-load time so a misconfigured deployment refuses to start
// instead of silently issuing tokens with an insecure default.

const KNOWN_INSECURE_SECRETS = new Set([
  'change-me-in-production',
  'change-me-to-a-secure-random-string',
  'queue-seva-dev-jwt-secret-change-in-production',
  'ci-build-secret-key-not-for-production',
  'secret',
  'changeme',
])

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured. Cannot sign/verify tokens.')
  }
  if (process.env.NODE_ENV === 'production') {
    if (KNOWN_INSECURE_SECRETS.has(secret)) {
      throw new Error('JWT_SECRET is set to a known insecure default. Refusing to start in production. Generate one with: openssl rand -base64 32')
    }
    if (secret.length < 32) {
      throw new Error('JWT_SECRET is too short (min 32 chars in production). Generate one with: openssl rand -base64 32')
    }
  }
  return secret
}

const ACCESS_TOKEN_EXPIRY = '24h'
const REFRESH_TOKEN_EXPIRY = '30d'

// Token type discriminator embedded as `typ` claim so an access route cannot
// accidentally accept a refresh token (or vice versa).
const ACCESS_TYP = 'access'
const REFRESH_TYP = 'refresh'

// ─── PASSWORD HELPERS ───────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12)
  return bcrypt.hash(password, salt)
}

export async function comparePassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

// ─── JWT HELPERS ────────────────────────────────────────

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, typ: ACCESS_TYP }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY })
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, typ: REFRESH_TYP }, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY })
}

/**
 * Verify a JWT and optionally enforce that it is of the expected token type.
 * Existing tokens issued before the `typ` claim was added remain valid (backwards-compatible)
 * because we only enforce the claim when it is present.
 */
export function verifyToken(token: string, expectedTyp?: 'access' | 'refresh'): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload & { typ?: string }
    if (expectedTyp && decoded.typ && decoded.typ !== expectedTyp) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

export function generateTokenPair(payload: JwtPayload) {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  }
}

// ─── AUTH MIDDLEWARE HELPER ─────────────────────────────

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/api-response'

export async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: errorResponse('Authorization header required', 401) }
  }

  const token = authHeader.substring(7)
  // Enforce that this is an access token (not a refresh token) when the typ claim is present.
  const payload = verifyToken(token, 'access')
  if (!payload) {
    return { user: null, error: errorResponse('Invalid or expired token', 401) }
  }

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      avatar: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!user || !user.isActive) {
    return { user: null, error: errorResponse('User not found or inactive', 401) }
  }

  return { user, error: null }
}

export async function requireAdmin(request: NextRequest) {
  const { user, error } = await authenticateRequest(request)
  if (error) return { user: null, error }
  if (user!.role !== 'ADMIN' && user!.role !== 'SUPER_ADMIN') {
    return { user: null, error: errorResponse('Admin access required', 403) }
  }
  return { user, error: null }
}
