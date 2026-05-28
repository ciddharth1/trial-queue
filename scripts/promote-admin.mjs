// Promote a user to SUPER_ADMIN. Idempotent.
//
// Usage (locally pointing at any DATABASE_URL):
//   DATABASE_URL=postgresql://... node scripts/promote-admin.mjs <email>
//
// Usage on Railway (recommended — no need to copy the connection string):
//   railway run node scripts/promote-admin.mjs <email>

import { PrismaClient } from '@prisma/client'

const email = process.argv[2]
if (!email) {
  console.error('Usage: node scripts/promote-admin.mjs <email>')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) {
    console.error(`No user found with email "${email}". Sign up first, then re-run this script.`)
    process.exit(2)
  }

  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    console.log(`User ${user.email} is already ${user.role}. No change needed.`)
    process.exit(0)
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true, role: true, name: true },
  })

  console.log('Promoted to SUPER_ADMIN:')
  console.log(updated)
} catch (err) {
  console.error('Promotion failed:', err)
  process.exit(3)
} finally {
  await prisma.$disconnect()
}
