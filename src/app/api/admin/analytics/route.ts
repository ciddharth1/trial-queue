import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

// GET - Get analytics data
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin(request)
    if (error) return error

    const { searchParams } = new URL(request.url)
    const queueId = searchParams.get('queueId')
    const dateRange = searchParams.get('dateRange') || '7d' // 1d, 7d, 30d, 90d
    const daysParam = searchParams.get('days') // Support numeric days parameter

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()

    if (daysParam) {
      // If numeric days parameter is provided, use it directly
      const days = parseInt(daysParam)
      if (!isNaN(days) && days > 0) {
        startDate.setDate(startDate.getDate() - days)
      } else {
        startDate.setDate(startDate.getDate() - 7)
      }
    } else {
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
        case '90d':
          startDate.setDate(startDate.getDate() - 90)
          break
        default:
          startDate.setDate(startDate.getDate() - 7)
      }
    }

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
    }
    if (queueId) where.queueId = queueId

    const analytics = await db.queueAnalytics.findMany({
      where,
      include: {
        queue: {
          select: { id: true, name: true, prefix: true },
        },
      },
      orderBy: { date: 'asc' },
    })

    // Aggregate totals
    const totals = analytics.reduce(
      (acc, a) => ({
        totalJoined: acc.totalJoined + a.totalJoined,
        totalServed: acc.totalServed + a.totalServed,
        totalCancelled: acc.totalCancelled + a.totalCancelled,
        totalNoShow: acc.totalNoShow + a.totalNoShow,
        avgWaitTime: acc.avgWaitTime + a.avgWaitTime,
        avgServiceTime: acc.avgServiceTime + a.avgServiceTime,
        maxQueueLength: Math.max(acc.maxQueueLength, a.maxQueueLength),
      }),
      {
        totalJoined: 0,
        totalServed: 0,
        totalCancelled: 0,
        totalNoShow: 0,
        avgWaitTime: 0,
        avgServiceTime: 0,
        maxQueueLength: 0,
      },
    )

    // Calculate averages
    const count = analytics.length || 1
    const summary = {
      ...totals,
      avgWaitTime: Math.round(totals.avgWaitTime / count),
      avgServiceTime: Math.round(totals.avgServiceTime / count),
      serviceRate: totals.totalJoined > 0
        ? Math.round((totals.totalServed / totals.totalJoined) * 100)
        : 0,
    }

    // Peak hours analysis
    const peakHourMap: Record<number, number> = {}
    analytics.forEach((a) => {
      if (a.peakHour !== null) {
        peakHourMap[a.peakHour] = (peakHourMap[a.peakHour] || 0) + 1
      }
    })

    const peakHours = Object.entries(peakHourMap)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count)

    // Daily traffic data for charts
    const dailyTraffic = analytics.map((a) => ({
      date: a.date,
      joined: a.totalJoined,
      served: a.totalServed,
      cancelled: a.totalCancelled,
      noShow: a.totalNoShow,
    }))

    return successResponse({
      summary,
      analytics,
      dailyTraffic,
      peakHours,
    })
  } catch (error) {
    console.error('Admin analytics error:', error)
    return errorResponse('Internal server error', 500)
  }
}
