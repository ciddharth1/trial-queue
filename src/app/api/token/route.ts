import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api-response'

// GET - List tokens with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    // Authenticate the user
    const { user, error: authError } = await authenticateRequest(request)
    if (authError || !user) return authError!

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const status = searchParams.get('status')
    const queueId = searchParams.get('queueId')
    const userId = searchParams.get('userId')

    // Non-admin users can only see their own tokens
    const effectiveUserId = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? userId : user.id

    const skip = (page - 1) * pageSize

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (queueId) where.queueId = queueId
    if (effectiveUserId) where.userId = effectiveUserId

    const [tokens, total] = await Promise.all([
      db.token.findMany({
        where,
        include: {
          queue: {
            select: { id: true, name: true, prefix: true },
          },
          user: {
            select: { id: true, name: true, email: true },
          },
          serviceCounter: {
            select: { id: true, name: true, label: true },
          },
        },
        orderBy: status === 'WAITING' ? { sequenceNum: 'asc' } : { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.token.count({ where }),
    ])

    return paginatedResponse(tokens, total, page, pageSize)
  } catch (error) {
    console.error('List tokens error:', error)
    return errorResponse('Internal server error', 500)
  }
}
