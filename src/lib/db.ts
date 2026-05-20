import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only force-disconnect in development mode to handle hot reload
// In production, reuse the cached client
if (process.env.NODE_ENV !== 'production' && globalForPrisma.prisma) {
  try {
    globalForPrisma.prisma.$disconnect()
  } catch {
    // ignore disconnect errors
  }
  globalForPrisma.prisma = undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
