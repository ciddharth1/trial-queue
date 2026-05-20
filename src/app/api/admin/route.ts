import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

// GET - Get admin overview stats
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin(request)
    if (error) return error

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const [
      totalUsers,
      activeQueues,
      totalServiceCenters,
      tokensServedToday,
      totalTokensToday,
      todayTokens,
    ] = await Promise.all([
      db.user.count(),
      db.queue.count({ where: { status: 'ACTIVE' } }),
      db.serviceCenter.count({ where: { isActive: true } }),
      db.token.count({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: today, lt: tomorrow },
        },
      }),
      db.token.count({
        where: {
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
      db.token.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: today, lt: tomorrow },
          calledAt: { not: null },
        },
        select: {
          calledAt: true,
          servedAt: true,
        },
      }),
    ])

    // Calculate average wait time for today's served tokens
    // Only count tokens that have both calledAt and servedAt for accurate measurement
    let avgWaitTime = 0
    const validWaitTokens = todayTokens.filter(t => t.calledAt && t.servedAt)
    if (validWaitTokens.length > 0) {
      const totalWaitTime = validWaitTokens.reduce((sum, token) => {
        return sum + (new Date(token.servedAt!).getTime() - new Date(token.calledAt!).getTime()) / 1000
      }, 0)
      avgWaitTime = Math.round(totalWaitTime / validWaitTokens.length)
    }

    // Get recent queues
    const recentQueues = await db.queue.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        serviceCenter: {
          select: { name: true },
        },
        _count: {
          select: { tokens: true },
        },
      },
    })

    // Get recent tokens
    const recentTokens = await db.token.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        queue: { select: { name: true } },
      },
    })

    return successResponse({
      totalUsers,
      activeQueues,
      totalServiceCenters,
      tokensServedToday,
      totalTokensToday,
      avgWaitTime,
      recentQueues,
      recentTokens,
    })
  } catch (error) {
    console.error('Admin overview error:', error)
    return errorResponse('Internal server error', 500)
  }
}
