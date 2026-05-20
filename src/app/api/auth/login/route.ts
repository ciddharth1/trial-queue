import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { comparePassword, generateTokenPair } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Validate required fields
    if (!email || !password) {
      return errorResponse('Email and password are required', 400)
    }

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (!user) {
      return errorResponse('Invalid email or password', 401)
    }

    // Check if user is active
    if (!user.isActive) {
      return errorResponse('Account is deactivated', 403)
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password)
    if (!isPasswordValid) {
      return errorResponse('Invalid email or password', 401)
    }

    // Generate tokens
    const tokenPair = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    // Delete existing sessions for this user (to avoid unique constraint issues)
    await db.session.deleteMany({
      where: { userId: user.id },
    })

    // Create session
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await db.session.create({
      data: {
        userId: user.id,
        token: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt,
      },
    })

    // Update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    // Return user (without password) + tokens
    const { password: _, ...userWithoutPassword } = user

    return successResponse(
      {
        user: userWithoutPassword,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
      },
      'Login successful',
    )
  } catch (error) {
    console.error('Login error:', error)
    return errorResponse('Internal server error', 500)
  }
}
