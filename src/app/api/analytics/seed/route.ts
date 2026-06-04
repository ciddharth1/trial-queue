import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

// Realistic traffic patterns per queue type
const QUEUE_PROFILES: Record<string, { base: number; variance: number; avgWait: number; avgService: number; peakHour: number }> = {
  A: { base: 35, variance: 20, avgWait: 420, avgService: 280, peakHour: 11 },  // General
  B: { base: 18, variance: 10, avgWait: 240, avgService: 160, peakHour: 10 },  // Priority
  C: { base: 22, variance: 12, avgWait: 540, avgService: 380, peakHour: 14 },  // Billing
  D: { base: 8,  variance: 4,  avgWait: 120, avgService: 90,  peakHour: 15 },  // VIP
  E: { base: 12, variance: 8,  avgWait: 600, avgService: 420, peakHour: 13 },  // Returns
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// POST - Seed analytics data (admin only)
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    const { user, error: authError } = await requireAdmin(request)
    if (authError || !user) return authError!

    const body = await request.json()
    const { days = 14 } = body

    const DAYS = parseInt(String(days), 10)

    // Get all queues
    const queues = await db.queue.findMany({
      select: { id: true, prefix: true, name: true },
    })

    if (queues.length === 0) {
      return errorResponse('No queues found. Create queues first.', 404)
    }

    let created = 0
    let updated = 0

    for (const queue of queues) {
      const profile = QUEUE_PROFILES[queue.prefix] || QUEUE_PROFILES.A

      for (let d = DAYS - 1; d >= 0; d--) {
        const date = new Date()
        date.setDate(date.getDate() - d)
        date.setHours(0, 0, 0, 0)

        // Weekends have lower traffic
        const isWeekend = date.getDay() === 0 || date.getDay() === 6
        const multiplier = isWeekend ? 0.4 : 1.0

        const totalJoined = Math.max(1, Math.round((profile.base + rand(-profile.variance, profile.variance)) * multiplier))
        const noShowCount = rand(0, Math.floor(totalJoined * 0.08))
        const cancelledCount = rand(0, Math.floor(totalJoined * 0.12))
        const totalServed = Math.max(0, totalJoined - noShowCount - cancelledCount)
        const avgWaitTime = profile.avgWait + rand(-60, 120)
        const avgServiceTime = profile.avgService + rand(-30, 60)
        const peakHour = profile.peakHour + rand(-1, 1)
        const maxQueueLength = Math.min(totalJoined, rand(Math.floor(totalJoined * 0.4), totalJoined))

        const result = await db.queueAnalytics.upsert({
          where: {
            queueId_date: {
              queueId: queue.id,
              date,
            },
          },
          update: {
            totalJoined,
            totalServed,
            totalCancelled: cancelledCount,
            totalNoShow: noShowCount,
            avgWaitTime,
            avgServiceTime,
            peakHour,
            maxQueueLength,
          },
          create: {
            queueId: queue.id,
            date,
            totalJoined,
            totalServed,
            totalCancelled: cancelledCount,
            totalNoShow: noShowCount,
            avgWaitTime,
            avgServiceTime,
            peakHour,
            maxQueueLength,
          },
        })

        if (result.updatedAt.getTime() === result.createdAt.getTime()) {
          created++
        } else {
          updated++
        }
      }
    }

    return successResponse(
      {
        created,
        updated,
        total: created + updated,
        queues: queues.length,
        days: DAYS,
      },
      `Successfully seeded ${created + updated} analytics records for ${queues.length} queues over ${DAYS} days`,
    )
  } catch (error) {
    console.error('Seed analytics error:', error)
    return errorResponse('Internal server error', 500)
  }
}
