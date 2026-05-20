import { db } from '@/lib/db'
import { PrismaClient } from '@prisma/client'

/**
 * Generate a token number string like "A-001"
 */
export function generateTokenNumber(prefix: string, sequenceNum: number): string {
  const paddedSeq = String(sequenceNum).padStart(3, '0')
  return `${prefix}-${paddedSeq}`
}

/**
 * Estimate wait time in seconds for a given position in a queue.
 * Uses moving average based on avgServiceTime.
 */
export function estimateWaitTime(avgServiceTime: number, position: number): number {
  if (position <= 0) return 0
  // Moving average: each person ahead takes avgServiceTime
  return avgServiceTime * position
}

/**
 * Get the next sequence number atomically for a queue.
 * IMPORTANT: This should be called WITHIN a transaction for race-condition safety.
 * Uses the transaction client (tx) when provided, otherwise falls back to db.
 */
export async function getNextSequence(queueId: string, tx?: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>): Promise<number> {
  const client = tx || db
  const lastToken = await client.token.findFirst({
    where: { queueId },
    orderBy: { sequenceNum: 'desc' },
    select: { sequenceNum: true },
  })
  return (lastToken?.sequenceNum ?? 0) + 1
}

/**
 * Recalculate positions for all waiting members in a queue.
 * Called after a member leaves or is served.
 */
export async function recalculatePositions(queueId: string): Promise<void> {
  const waitingMembers = await db.queueMember.findMany({
    where: {
      queueId,
      status: 'WAITING',
    },
    orderBy: { joinedAt: 'asc' },
  })

  await db.$transaction(
    waitingMembers.map((member, index) =>
      db.queueMember.update({
        where: { id: member.id },
        data: { position: index + 1 },
      }),
    ),
  )
}

/**
 * Update the current length of a queue based on active members.
 */
export async function updateQueueLength(queueId: string): Promise<void> {
  const activeCount = await db.queueMember.count({
    where: {
      queueId,
      status: { in: ['WAITING', 'SERVING'] },
    },
  })

  await db.queue.update({
    where: { id: queueId },
    data: { currentLength: activeCount },
  })
}

/**
 * Generate QR code data for a queue.
 * Returns a JSON string with queue join information.
 */
export function generateQRCodeData(queueId: string, queueName: string, prefix: string): string {
  return JSON.stringify({
    type: 'QUEUE_JOIN',
    queueId,
    queueName,
    prefix,
    timestamp: new Date().toISOString(),
  })
}
