import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from '@/types'

const JWT_SECRET = process.env.JWT_SECRET || 'queue-seva-jwt-secret-key-2024'
const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '7d'

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
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
  const payload = verifyToken(token)
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
