import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest } from '@/lib/auth'
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api-response'

// GET - Get user notifications
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error) return error

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const isRead = searchParams.get('isRead')
    const type = searchParams.get('type')

    const skip = (page - 1) * pageSize

    const where: Record<string, unknown> = { userId: user!.id }
    if (isRead !== null && isRead !== undefined && isRead !== '') {
      where.isRead = isRead === 'true'
    }
    if (type) where.type = type

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.notification.count({ where }),
    ])

    // Get unread count
    const unreadCount = await db.notification.count({
      where: { userId: user!.id, isRead: false },
    })

    return successResponse({
      items: notifications,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      unreadCount,
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// PATCH - Mark notifications as read
export async function PATCH(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error) return error

    const body = await request.json()
    const { notificationIds, markAll } = body

    if (markAll) {
      // Mark all notifications as read
      await db.notification.updateMany({
        where: { userId: user!.id, isRead: false },
        data: { isRead: true },
      })

      return successResponse(null, 'All notifications marked as read')
    }

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return errorResponse('notificationIds array or markAll flag is required', 400)
    }

    // Mark specific notifications as read
    const result = await db.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId: user!.id, // Ensure user owns these notifications
      },
      data: { isRead: true },
    })

    return successResponse(
      { updated: result.count },
      `${result.count} notification(s) marked as read`,
    )
  } catch (error) {
    console.error('Mark notifications error:', error)
    return errorResponse('Internal server error', 500)
  }
}
