import { PrismaClient } from '@prisma/client'

// ─── Prisma client singleton ────────────────────────────
// In dev, Next.js hot-reload re-evaluates this module on every change. Caching
// the client on globalThis prevents leaking connection pools across reloads.
// In production we always create a fresh instance per process.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

if (!process.env.DATABASE_URL) {
  // Surface this loudly. Without DATABASE_URL Prisma will throw on the first
  // query — better to fail at startup with a clear message.
  console.warn('[DB] DATABASE_URL is not set. Prisma will fail on the first query.')
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
