// Seed a small set of demo service centers, counters and queues for an existing admin.
// Idempotent — re-runs are safe, no duplicates.
//
// Usage:
//   DATABASE_URL=postgresql://... node scripts/seed-demo-queues.mjs <adminEmail>
//
//   railway run node scripts/seed-demo-queues.mjs admin@queueseva.com
//
// Picks the named admin as the owner of the new service center / queues. The
// admin must already exist (sign up first or run scripts/ensure-admin.mjs).

import { PrismaClient } from '@prisma/client'

const adminEmail = (process.argv[2] || '').toLowerCase().trim()
if (!adminEmail) {
  console.error('Usage: node scripts/seed-demo-queues.mjs <adminEmail>')
  process.exit(1)
}

const prisma = new PrismaClient()

function generateQRCodeData(queueId, queueName, prefix) {
  return JSON.stringify({
    type: 'QUEUE_JOIN',
    queueId,
    queueName,
    prefix,
    timestamp: new Date().toISOString(),
  })
}

async function ensureCounter(centerId, name, label) {
  const existing = await prisma.serviceCounter.findFirst({
    where: { name, serviceCenterId: centerId },
  })
  if (existing) return existing
  return prisma.serviceCounter.create({
    data: { name, label, serviceCenterId: centerId },
  })
}

async function ensureQueue(input) {
  const existing = await prisma.queue.findFirst({
    where: { name: input.name, serviceCenterId: input.serviceCenterId },
  })
  if (existing) {
    console.log(`  - queue exists: ${existing.name} (${existing.prefix}-XXX)`)
    return existing
  }
  const created = await prisma.queue.create({
    data: {
      name: input.name,
      description: input.description,
      prefix: input.prefix,
      status: input.status,
      maxCapacity: input.maxCapacity,
      currentLength: 0,
      avgServiceTime: input.avgServiceTime,
      serviceCenterId: input.serviceCenterId,
      ownerId: input.ownerId,
      qrCode: generateQRCodeData('', input.name, input.prefix),
    },
  })
  await prisma.queue.update({
    where: { id: created.id },
    data: { qrCode: generateQRCodeData(created.id, input.name, input.prefix) },
  })
  console.log(`  + queue created: ${created.name} (${created.prefix}-XXX) [${created.status}]`)
  return created
}

try {
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (!admin) {
    console.error(`No user found with email "${adminEmail}". Sign up first or run ensure-admin.mjs.`)
    process.exit(2)
  }
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
    console.error(`User ${admin.email} is role ${admin.role}, not an admin. Promote first.`)
    process.exit(3)
  }

  // Ensure a service center owned by this admin
  let center = await prisma.serviceCenter.findFirst({
    where: { name: 'QueueSeva Main Branch', ownerId: admin.id },
  })
  if (!center) {
    center = await prisma.serviceCenter.create({
      data: {
        name: 'QueueSeva Main Branch',
        description: 'Primary service center',
        address: '1 Service Plaza',
        phone: '+1 555 0100',
        email: 'main@queueseva.com',
        ownerId: admin.id,
      },
    })
    console.log(`+ service center created: ${center.name}`)
  } else {
    console.log(`  service center exists: ${center.name}`)
  }

  // Counters
  await ensureCounter(center.id, 'Counter 1', 'General')
  await ensureCounter(center.id, 'Counter 2', 'Priority')
  await ensureCounter(center.id, 'Counter 3', 'VIP')

  // Queues
  const queues = [
    {
      name: 'General Service',
      description: 'Standard customer service queue',
      prefix: 'A',
      status: 'ACTIVE',
      maxCapacity: 100,
      avgServiceTime: 300,
    },
    {
      name: 'Priority Counter',
      description: 'Fast-track for premium customers',
      prefix: 'B',
      status: 'ACTIVE',
      maxCapacity: 50,
      avgServiceTime: 180,
    },
    {
      name: 'Billing & Payments',
      description: 'Payments and account billing',
      prefix: 'C',
      status: 'ACTIVE',
      maxCapacity: 80,
      avgServiceTime: 420,
    },
    {
      name: 'VIP Service',
      description: 'Premium VIP-only lane',
      prefix: 'D',
      status: 'ACTIVE',
      maxCapacity: 30,
      avgServiceTime: 120,
    },
    {
      name: 'Returns & Exchange',
      description: 'Returns processing — currently paused',
      prefix: 'E',
      status: 'PAUSED',
      maxCapacity: 60,
      avgServiceTime: 540,
    },
  ]

  for (const q of queues) {
    await ensureQueue({ ...q, serviceCenterId: center.id, ownerId: admin.id })
  }

  console.log('\nDone. Sign in as admin and check the dashboard.')
} catch (err) {
  console.error('Seed failed:', err)
  process.exit(4)
} finally {
  await prisma.$disconnect()
}
