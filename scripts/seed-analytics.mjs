// Seed realistic analytics data for all queues.
// Idempotent — uses upsert so re-running is safe.
// Usage: DATABASE_URL=... node scripts/seed-analytics.mjs [days=14]

import { PrismaClient } from '@prisma/client'

const DAYS = parseInt(process.argv[2] || '14', 10)
const prisma = new PrismaClient()

// Realistic traffic patterns per queue type
const QUEUE_PROFILES = {
  A: { base: 35, variance: 20, avgWait: 420, avgService: 280, peakHour: 11 },  // General
  B: { base: 18, variance: 10, avgWait: 240, avgService: 160, peakHour: 10 },  // Priority
  C: { base: 22, variance: 12, avgWait: 540, avgService: 380, peakHour: 14 },  // Billing
  D: { base: 8,  variance: 4,  avgWait: 120, avgService: 90,  peakHour: 15 },  // VIP
  E: { base: 12, variance: 8,  avgWait: 600, avgService: 420, peakHour: 13 },  // Returns
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

try {
  const queues = await prisma.queue.findMany({ select: { id: true, prefix: true, name: true } })
  if (queues.length === 0) {
    console.error('No queues found. Run seed-demo-queues.mjs first.')
    process.exit(1)
  }

  let created = 0
  let skipped = 0

  for (const queue of queues) {
    const profile = QUEUE_PROFILES[queue.prefix] || QUEUE_PROFILES.A
    console.log(`Seeding ${DAYS} days for ${queue.name} (${queue.prefix})...`)

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

      try {
        await prisma.queueAnalytics.upsert({
          where: { queueId_date: { queueId: queue.id, date } },
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
        created++
      } catch (err) {
        if (err.code === 'P2002') { skipped++; continue }
        throw err
      }
    }
  }

  console.log(`\nDone. Created/updated: ${created}, skipped: ${skipped}`)
  console.log('Refresh the Analytics page — charts should now show data.')
} catch (err) {
  console.error('Seed failed:', err)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
