// Ensure a dedicated admin account exists with a known password.
// Idempotent — re-running never creates duplicates and never resets a password
// that was already set unless ALLOW_PASSWORD_RESET=1 is provided.
//
// Usage:
//   railway run node scripts/ensure-admin.mjs admin@queueseva.com 'YourStrongPassword'
//   ALLOW_PASSWORD_RESET=1 railway run node scripts/ensure-admin.mjs admin@queueseva.com 'NewPassword'

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const email = (process.argv[2] || '').toLowerCase().trim()
const password = process.argv[3]

if (!email || !password) {
  console.error('Usage: node scripts/ensure-admin.mjs <email> <password>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    const updates = {}
    if (existing.role !== 'SUPER_ADMIN' && existing.role !== 'ADMIN') {
      updates.role = 'SUPER_ADMIN'
    }
    if (process.env.ALLOW_PASSWORD_RESET === '1') {
      updates.password = await bcrypt.hash(password, 12)
      updates.authProvider = 'LOCAL'
    }
    if (Object.keys(updates).length > 0) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: updates,
        select: { id: true, email: true, role: true, name: true },
      })
      console.log('Updated existing admin:', updated)
    } else {
      console.log(`Admin ${email} already exists with role ${existing.role}. No change.`)
      console.log('To reset its password, re-run with ALLOW_PASSWORD_RESET=1.')
    }
    process.exit(0)
  }

  const hashed = await bcrypt.hash(password, 12)
  const created = await prisma.user.create({
    data: {
      email,
      name: 'QueueSeva Admin',
      password: hashed,
      role: 'SUPER_ADMIN',
      isActive: true,
      authProvider: 'LOCAL',
    },
    select: { id: true, email: true, role: true, name: true },
  })
  console.log('Created admin:', created)
} catch (err) {
  console.error('ensure-admin failed:', err)
  process.exit(2)
} finally {
  await prisma.$disconnect()
}
