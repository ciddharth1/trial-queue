import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, generateAccessToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { refreshToken } = body

    if (!refreshToken) {
      return errorResponse('Refresh token is required', 400)
    }

    // Verify refresh token
    const payload = verifyToken(refreshToken)
    if (!payload) {
      return errorResponse('Invalid or expired refresh token', 401)
    }

    // Find session with this refresh token
    const session = await db.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    })

    if (!session) {
      return errorResponse('Session not found', 401)
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } })
      return errorResponse('Session expired, please login again', 401)
    }

    // Check if user is still active
    if (!session.user.isActive) {
      return errorResponse('Account is deactivated', 403)
    }

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
    })

    // Update session token
    await db.session.update({
      where: { id: session.id },
      data: { token: newAccessToken },
    })

    return successResponse(
      { accessToken: newAccessToken },
      'Token refreshed successfully',
    )
  } catch (error) {
    console.error('Token refresh error:', error)
    return errorResponse('Internal server error', 500)
  }
}
