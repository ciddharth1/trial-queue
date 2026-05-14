import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create demo admin user FIRST
  const hashedAdminPassword = await bcrypt.hash('password', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      id: 'admin-demo',
      email: 'admin@demo.com',
      name: 'Admin User',
      password: hashedAdminPassword,
      phone: '+91 9876543200',
      role: 'ADMIN',
      isActive: true,
    },
  })

  // Create demo regular user
  const hashedUserPassword = await bcrypt.hash('password', 12)
  const user = await prisma.user.upsert({
    where: { email: 'user@demo.com' },
    update: {},
    create: {
      id: 'user-demo',
      email: 'user@demo.com',
      name: 'John Doe',
      password: hashedUserPassword,
      phone: '+91 9876543201',
      role: 'USER',
      isActive: true,
    },
  })

  // Create demo service center
  const center = await prisma.serviceCenter.create({
    data: {
      name: 'City Service Hub',
      description: 'Main customer service center',
      address: '123 Main Street, Downtown',
      phone: '+91 9876543210',
      email: 'info@cityservicehub.com',
      ownerId: admin.id,
    },
  })

  // Create service counters
  const counter1 = await prisma.serviceCounter.create({
    data: { name: 'Counter 1', label: 'General', serviceCenterId: center.id },
  })
  const counter2 = await prisma.serviceCounter.create({
    data: { name: 'Counter 2', label: 'Priority', serviceCenterId: center.id },
  })
  const counter3 = await prisma.serviceCounter.create({
    data: { name: 'Counter 3', label: 'VIP', serviceCenterId: center.id },
  })

  // Create demo queues
  const queueA = await prisma.queue.create({
    data: {
      name: 'General Service',
      description: 'Main service queue for all general inquiries',
      prefix: 'A',
      status: 'ACTIVE',
      maxCapacity: 100,
      currentLength: 8,
      avgServiceTime: 300,
      serviceCenterId: center.id,
      ownerId: admin.id,
    },
  })

  const queueB = await prisma.queue.create({
    data: {
      name: 'Priority Counter',
      description: 'Fast-track priority service',
      prefix: 'B',
      status: 'ACTIVE',
      maxCapacity: 50,
      currentLength: 3,
      avgServiceTime: 180,
      serviceCenterId: center.id,
      ownerId: admin.id,
    },
  })

  const queueC = await prisma.queue.create({
    data: {
      name: 'Billing & Payments',
      description: 'Billing inquiries and payment processing',
      prefix: 'C',
      status: 'ACTIVE',
      maxCapacity: 80,
      currentLength: 5,
      avgServiceTime: 420,
      serviceCenterId: center.id,
      ownerId: admin.id,
    },
  })

  const queueD = await prisma.queue.create({
    data: {
      name: 'VIP Service',
      description: 'Premium VIP service lane',
      prefix: 'D',
      status: 'ACTIVE',
      maxCapacity: 30,
      currentLength: 2,
      avgServiceTime: 120,
      serviceCenterId: center.id,
      ownerId: admin.id,
    },
  })

  const queueE = await prisma.queue.create({
    data: {
      name: 'Returns & Exchange',
      description: 'Product returns and exchange processing',
      prefix: 'E',
      status: 'PAUSED',
      maxCapacity: 60,
      currentLength: 0,
      avgServiceTime: 540,
      serviceCenterId: center.id,
      ownerId: admin.id,
    },
  })

  // Create demo tokens
  for (let i = 1; i <= 8; i++) {
    const status = i <= 2 ? 'COMPLETED' : i <= 4 ? 'SERVING' : i === 5 ? 'CALLED' : 'WAITING'
    await prisma.token.create({
      data: {
        tokenNumber: `A-${String(i).padStart(3, '0')}`,
        sequenceNum: i,
        status,
        queueId: queueA.id,
        userId: i <= 3 ? admin.id : user.id,
        serviceCounterId: i <= 2 ? counter1.id : i <= 4 ? counter2.id : null,
        calledAt: i <= 5 ? new Date() : null,
        servedAt: i <= 4 ? new Date() : null,
        completedAt: i <= 2 ? new Date() : null,
        estimatedWait: i > 5 ? (i - 5) * 300 : null,
      },
    })
  }

  for (let i = 1; i <= 3; i++) {
    const status = i === 1 ? 'SERVING' : 'WAITING'
    await prisma.token.create({
      data: {
        tokenNumber: `B-${String(i).padStart(3, '0')}`,
        sequenceNum: i,
        status,
        queueId: queueB.id,
        userId: user.id,
        estimatedWait: i > 1 ? (i - 1) * 180 : null,
      },
    })
  }

  for (let i = 1; i <= 5; i++) {
    const status = i <= 1 ? 'SERVING' : 'WAITING'
    await prisma.token.create({
      data: {
        tokenNumber: `C-${String(i).padStart(3, '0')}`,
        sequenceNum: i,
        status,
        queueId: queueC.id,
        userId: i <= 2 ? admin.id : user.id,
        estimatedWait: i > 1 ? (i - 1) * 420 : null,
      },
    })
  }

  // Create queue members (unique userId per queue with WAITING status)
  const waitingUsers = [
    { queueId: queueA.id, userId: admin.id, position: 1 },
    { queueId: queueA.id, userId: user.id, position: 2 },
  ]
  for (const member of waitingUsers) {
    await prisma.queueMember.create({
      data: {
        queueId: member.queueId,
        userId: member.userId,
        position: member.position,
        status: 'WAITING',
        joinedAt: new Date(Date.now() - member.position * 300000),
      },
    })
  }

  // Add some completed members
  await prisma.queueMember.create({
    data: {
      queueId: queueA.id,
      userId: admin.id,
      position: 0,
      status: 'COMPLETED',
      joinedAt: new Date(Date.now() - 600000),
      servedAt: new Date(Date.now() - 300000),
    },
  })

  // Create demo notifications
  await prisma.notification.createMany({
    data: [
      { userId: user.id, title: 'Welcome to QueueSeva!', message: 'Your account has been created successfully. Start by joining a queue!', type: 'SUCCESS' },
      { userId: user.id, title: 'Token A-005 Called', message: 'Your token A-005 has been called! Please proceed to Counter 2.', type: 'TOKEN_CALLED' },
      { userId: user.id, title: 'Queue Update', message: 'General Service queue is now moving faster. Average wait reduced by 3 minutes.', type: 'QUEUE_UPDATE' },
      { userId: user.id, title: 'Position Update', message: 'Your position has moved up to #2. Estimated wait: 10 minutes.', type: 'QUEUE_UPDATE' },
      { userId: admin.id, title: 'New Queue Created', message: 'VIP Service queue has been created successfully.', type: 'SUCCESS' },
      { userId: admin.id, title: 'Peak Hour Alert', message: 'General Service queue is nearing capacity. Consider opening another counter.', type: 'WARNING' },
    ],
  })

  // Create demo analytics
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

  console.log('✅ Seed data created successfully!')
  console.log({
    admin: { email: 'admin@demo.com', password: 'password' },
    user: { email: 'user@demo.com', password: 'password' },
    queues: 5,
    notifications: 6,
  })
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
