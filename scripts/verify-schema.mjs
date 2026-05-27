// One-shot DB schema verifier. Confirms migrations landed and data is intact.
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
try {
  const users = await p.user.count()
  const cols = await p.$queryRawUnsafe('PRAGMA table_info(User)')
  console.log('users:', users)
  console.log('User columns:', cols.map((c) => c.name).join(', '))
  // Sanity: each demo user should still exist with their original auth state
  const admin = await p.user.findUnique({ where: { email: 'admin@demo.com' } })
  console.log('admin authProvider:', admin?.authProvider, 'has password:', !!admin?.password, 'googleId:', admin?.googleId)
} finally {
  await p.$disconnect()
}
