import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

// GET - Get queue analytics (queue-specific or overall) — admin only
export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    const { user, error: authError } = await requireAdmin(request)
    if (authError || !user) return authError!
    const { searchParams } = new URL(request.url)
    const queueId = searchParams.get('queueId')
    const dateRange = searchParams.get('dateRange') || '7d'

    // If queueId provided, get queue-specific analytics; otherwise get overall analytics
    let queue: Awaited<ReturnType<typeof db.queue.findUnique>> = null
    if (queueId) {
      queue = await db.queue.findUnique({ where: { id: queueId } })
      if (!queue) {
        return errorResponse('Queue not found', 404)
      }
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

    // Build where clause - filter by queueId if provided
    const analyticsWhere: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
    }
    if (queueId) analyticsWhere.queueId = queueId

    // Get analytics records
    const analytics = await db.queueAnalytics.findMany({
      where: analyticsWhere,
      orderBy: { date: 'asc' },
    })

    // Get current performance
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tokenWhere = queueId ? { queueId } : {}
    const tokenWhereToday = { ...tokenWhere, createdAt: { gte: today } }

    const [todayJoined, todayServed, todayCancelled, todayNoShow, currentWaiting, avgWaitToday] = await Promise.all([
      db.token.count({ where: tokenWhereToday }),
      db.token.count({ where: { ...tokenWhere, status: 'COMPLETED', completedAt: { gte: today } } }),
      db.token.count({ where: { ...tokenWhereToday, status: 'CANCELLED' } }),
      db.token.count({ where: { ...tokenWhereToday, status: 'EXPIRED' } }),
      db.token.count({ where: { ...tokenWhere, status: 'WAITING' } }),
      db.token.aggregate({
        where: {
          ...tokenWhere,
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
        ...tokenWhere,
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

    // Daily traffic for chart - aggregate across all queues if no queueId
    const dailyTraffic = queueId
      ? analytics.map((a) => ({
          date: a.date,
          joined: a.totalJoined,
          served: a.totalServed,
          cancelled: a.totalCancelled,
          noShow: a.totalNoShow,
          avgWaitTime: a.avgWaitTime,
          avgServiceTime: a.avgServiceTime,
        }))
      : (() => {
          // Aggregate daily traffic across all queues
          const dayMap = new Map<string, { date: Date; joined: number; served: number; cancelled: number; noShow: number; avgWaitTime: number; avgServiceTime: number; count: number }>()
          analytics.forEach((a) => {
            const dateKey = new Date(a.date).toISOString().split('T')[0]
            const existing = dayMap.get(dateKey)
            if (existing) {
              existing.joined += a.totalJoined
              existing.served += a.totalServed
              existing.cancelled += a.totalCancelled
              existing.noShow += a.totalNoShow
              existing.avgWaitTime += a.avgWaitTime
              existing.avgServiceTime += a.avgServiceTime
              existing.count += 1
            } else {
              dayMap.set(dateKey, {
                date: a.date,
                joined: a.totalJoined,
                served: a.totalServed,
                cancelled: a.totalCancelled,
                noShow: a.totalNoShow,
                avgWaitTime: a.avgWaitTime,
                avgServiceTime: a.avgServiceTime,
                count: 1,
              })
            }
          })
          return Array.from(dayMap.values()).map((d) => ({
            date: d.date,
            joined: d.joined,
            served: d.served,
            cancelled: d.cancelled,
            noShow: d.noShow,
            avgWaitTime: Math.round(d.avgWaitTime / d.count),
            avgServiceTime: Math.round(d.avgServiceTime / d.count),
          }))
        })()

    // Aggregate summary
    const summary = {
      todayJoined,
      todayServed,
      todayCancelled,
      todayNoShow,
      currentWaiting,
      avgWaitTimeToday: avgWaitToday._avg.estimatedWait
        ? Math.round(avgWaitToday._avg.estimatedWait)
        : (queue?.avgServiceTime || 300),
      serviceRate: todayJoined > 0 ? Math.round((todayServed / todayJoined) * 100) : 0,
    }

    // Build response
    const responseData: Record<string, unknown> = {
      summary,
      dailyTraffic,
      peakHours,
      analytics,
    }

    // Add queue info only if queueId was provided
    if (queue) {
      responseData.queue = {
        id: queue.id,
        name: queue.name,
        prefix: queue.prefix,
        status: queue.status,
      }
    }

    return successResponse(responseData)
  } catch (error) {
    console.error('Queue analytics error:', error)
    return errorResponse('Internal server error', 500)
  }
}
