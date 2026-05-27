import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, generateTokenPair } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, password, phone } = body

    // Validate required fields
    if (!email || !name || !password) {
      return errorResponse('Email, name, and password are required', 400)
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email format', 400)
    }

    // Validate password length
    if (password.length < 6) {
      return errorResponse('Password must be at least 6 characters', 400)
    }

    // Validate name length
    if (name.trim().length < 2) {
      return errorResponse('Name must be at least 2 characters', 400)
    }

    // Check email uniqueness
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    })
    if (existingUser) {
      return errorResponse('Email already registered', 409)
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        name: name.trim(),
        password: hashedPassword,
        phone: phone || null,
      },
    })

    // Generate tokens
    const tokenPair = generateTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    // Create session
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

    await db.session.create({
      data: {
        userId: user.id,
        token: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt,
      },
    })

    // Return user (without password) + tokens
    const { password: _, ...userWithoutPassword } = user

    return successResponse(
      {
        user: userWithoutPassword,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
      },
      'Registration successful',
      201,
    )
  } catch (error) {
    console.error('Registration error:', error)
    return errorResponse('Internal server error', 500)
  }
}
