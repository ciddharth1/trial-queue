import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function generateQRCodeData(queueId: string, queueName: string, prefix: string): string {
  return JSON.stringify({
    type: 'QUEUE_JOIN',
    queueId,
    queueName,
    prefix,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Idempotent seed. Safe to re-run.
 * Skips entirely when SEED_SKIP=1 is set in the environment.
 * Refuses to seed in production unless ALLOW_PRODUCTION_SEED=1 is set explicitly,
 * to avoid accidentally creating demo accounts on a real database.
 */
async function main() {
  if (process.env.SEED_SKIP === '1') {
    console.log('[seed] SEED_SKIP=1 — skipping')
    return
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== '1') {
    console.log('[seed] Refusing to seed production database. Set ALLOW_PRODUCTION_SEED=1 to override.')
    return
  }

  console.log('🌱 Seeding database...')

  // Demo admin (idempotent)
  const hashedAdminPassword = await bcrypt.hash('password', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      name: 'Admin User',
      password: hashedAdminPassword,
      phone: '+91 9876543200',
      role: 'ADMIN',
      isActive: true,
      authProvider: 'LOCAL',
    },
  })

  // Demo regular user (idempotent)
  const hashedUserPassword = await bcrypt.hash('password', 12)
  const user = await prisma.user.upsert({
    where: { email: 'user@demo.com' },
    update: {},
    create: {
      email: 'user@demo.com',
      name: 'John Doe',
      password: hashedUserPassword,
      phone: '+91 9876543201',
      role: 'USER',
      isActive: true,
      authProvider: 'LOCAL',
    },
  })

  // Service center (find-or-create by owner+name to keep idempotent)
  let center = await prisma.serviceCenter.findFirst({
    where: { name: 'City Service Hub', ownerId: admin.id },
  })
  if (!center) {
    center = await prisma.serviceCenter.create({
      data: {
        name: 'City Service Hub',
        description: 'Main customer service center',
        address: '123 Main Street, Downtown',
        phone: '+91 9876543210',
        email: 'info@cityservicehub.com',
        ownerId: admin.id,
      },
    })
  }

  // Counters (find-or-create per name within the center)
  async function ensureCounter(name: string, label: string) {
    const existing = await prisma.serviceCounter.findFirst({
      where: { name, serviceCenterId: center!.id },
    })
    return existing ?? prisma.serviceCounter.create({
      data: { name, label, serviceCenterId: center!.id },
    })
  }
  const counter1 = await ensureCounter('Counter 1', 'General')
  await ensureCounter('Counter 2', 'Priority')
  await ensureCounter('Counter 3', 'VIP')

  // Queues (find-or-create per name)
  async function ensureQueue(input: {
    name: string
    description: string
    prefix: string
    status: string
    maxCapacity: number
    avgServiceTime: number
  }) {
    const existing = await prisma.queue.findFirst({
      where: { name: input.name, serviceCenterId: center!.id },
    })
    if (existing) return existing
    const created = await prisma.queue.create({
      data: {
        ...input,
        currentLength: 0,
        serviceCenterId: center!.id,
        ownerId: admin.id,
        qrCode: generateQRCodeData('', input.name, input.prefix),
      },
    })
    await prisma.queue.update({
      where: { id: created.id },
      data: { qrCode: generateQRCodeData(created.id, input.name, input.prefix) },
    })
    return created
  }

  const queueA = await ensureQueue({
    name: 'General Service',
    description: 'Main service queue for all general inquiries',
    prefix: 'A',
    status: 'ACTIVE',
    maxCapacity: 100,
    avgServiceTime: 300,
  })
  await ensureQueue({
    name: 'Priority Counter',
    description: 'Fast-track priority service',
    prefix: 'B',
    status: 'ACTIVE',
    maxCapacity: 50,
    avgServiceTime: 180,
  })
  await ensureQueue({
    name: 'Billing & Payments',
    description: 'Billing inquiries and payment processing',
    prefix: 'C',
    status: 'ACTIVE',
    maxCapacity: 80,
    avgServiceTime: 420,
  })
  await ensureQueue({
    name: 'VIP Service',
    description: 'Premium VIP service lane',
    prefix: 'D',
    status: 'ACTIVE',
    maxCapacity: 30,
    avgServiceTime: 120,
  })
  await ensureQueue({
    name: 'Returns & Exchange',
    description: 'Product returns and exchange processing',
    prefix: 'E',
    status: 'PAUSED',
    maxCapacity: 60,
    avgServiceTime: 540,
  })

  // Notifications — only create if user has none, to keep idempotent
  const notifCount = await prisma.notification.count({ where: { userId: user.id } })
  if (notifCount === 0) {
    await prisma.notification.createMany({
      data: [
        { userId: user.id, title: 'Welcome to QueueSeva!', message: 'Your account has been created successfully. Start by joining a queue!', type: 'SUCCESS' },
        { userId: user.id, title: 'Queue Update', message: 'General Service queue is now moving faster.', type: 'QUEUE_UPDATE' },
        { userId: admin.id, title: 'Demo data ready', message: 'Demo queues, counters, and accounts are seeded.', type: 'INFO' },
      ],
    })
  }

  // Analytics — only seed if there are no analytics rows for this queue
  const analyticsCount = await prisma.queueAnalytics.count({ where: { queueId: queueA.id } })
  if (analyticsCount === 0) {
    const today = new Date()
    for (let d = 6; d >= 0; d--) {
      const date = new Date(today)
      date.setDate(date.getDate() - d)
      date.setHours(0, 0, 0, 0)
      await prisma.queueAnalytics.create({
        data: {
          queueId: queueA.id,
          date,
          totalJoined: 25 + Math.floor(Math.random() * 30),
          totalServed: 20 + Math.floor(Math.random() * 25),
          totalCancelled: Math.floor(Math.random() * 5),
          totalNoShow: Math.floor(Math.random() * 3),
          avgWaitTime: 240 + Math.floor(Math.random() * 300),
          avgServiceTime: 180 + Math.floor(Math.random() * 180),
          peakHour: 11 + Math.floor(Math.random() * 3),
          maxQueueLength: 15 + Math.floor(Math.random() * 20),
        },
      })
    }
  }

  // Reference counter1 to avoid unused var
  void counter1

  console.log('✅ Seed data created successfully (idempotent)')
  console.log('   Admin: admin@demo.com / password')
  console.log('   User : user@demo.com / password')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
