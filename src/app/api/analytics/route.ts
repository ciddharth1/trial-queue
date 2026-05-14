import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

// GET - Get queue analytics (public or authenticated)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queueId = searchParams.get('queueId')
    const dateRange = searchParams.get('dateRange') || '7d'

    if (!queueId) {
      return errorResponse('Queue ID is required', 400)
    }

    // Check queue exists
    const queue = await db.queue.findUnique({ where: { id: queueId } })
    if (!queue) {
      return errorResponse('Queue not found', 404)
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()

    switch (dateRange) {
      case '1d':
        startDate.setDate(startDate.getDate() - 1)
        break
      case '7d':
        startDate.setDate(startDate.getDate() - 7)
        break
      case '30d':
        startDate.setDate(startDate.getDate() - 30)
        break
      default:
        startDate.setDate(startDate.getDate() - 7)
    }

    // Get analytics records
    const analytics = await db.queueAnalytics.findMany({
      where: {
        queueId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    })

    // Get current queue performance
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [todayJoined, todayServed, todayCancelled, todayNoShow, currentWaiting, avgWaitToday] = await Promise.all([
      db.token.count({
        where: { queueId, createdAt: { gte: today } },
      }),
      db.token.count({
        where: { queueId, status: 'COMPLETED', completedAt: { gte: today } },
      }),
      db.token.count({
        where: { queueId, status: 'CANCELLED', createdAt: { gte: today } },
      }),
      db.token.count({
        where: { queueId, status: 'EXPIRED', createdAt: { gte: today } },
      }),
      db.token.count({
        where: { queueId, status: 'WAITING' },
      }),
      db.token.aggregate({
        where: {
          queueId,
          status: 'COMPLETED',
          completedAt: { gte: today },
          estimatedWait: { not: null },
        },
        _avg: { estimatedWait: true },
      }),
    ])

    // Peak hours analysis from token data
    const tokensByHour = await db.token.findMany({
      where: {
        queueId,
        createdAt: { gte: startDate },
      },
      select: { createdAt: true },
    })

    const hourMap: Record<number, number> = {}
    tokensByHour.forEach((t) => {
      const hour = new Date(t.createdAt).getHours()
      hourMap[hour] = (hourMap[hour] || 0) + 1
    })

    const peakHours = Object.entries(hourMap)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Daily traffic for chart
    const dailyTraffic = analytics.map((a) => ({
      date: a.date,
      joined: a.totalJoined,
      served: a.totalServed,
      cancelled: a.totalCancelled,
      noShow: a.totalNoShow,
      avgWaitTime: a.avgWaitTime,
      avgServiceTime: a.avgServiceTime,
    }))

    // Aggregate summary
    const summary = {
      todayJoined,
      todayServed,
      todayCancelled,
      todayNoShow,
      currentWaiting,
      avgWaitTimeToday: avgWaitToday._avg.estimatedWait
        ? Math.round(avgWaitToday._avg.estimatedWait)
        : queue.avgServiceTime,
      serviceRate: todayJoined > 0 ? Math.round((todayServed / todayJoined) * 100) : 0,
    }

    return successResponse({
      queue: {
        id: queue.id,
        name: queue.name,
        prefix: queue.prefix,
        status: queue.status,
      },
      summary,
      dailyTraffic,
      peakHours,
      analytics,
    })
  } catch (error) {
    console.error('Queue analytics error:', error)
    return errorResponse('Internal server error', 500)
  }
}
