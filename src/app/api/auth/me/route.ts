import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error) return error

    return successResponse(user, 'User profile retrieved successfully')
  } catch (error) {
    console.error('Get profile error:', error)
    return errorResponse('Internal server error', 500)
  }
}
