import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'
import { generateTokenNumber, estimateWaitTime, getNextSequence } from '@/lib/queue-utils'
import { broadcastTokenCreated, broadcastQueueJoined } from '@/lib/socket-broadcast'
import { generateQrSecret, signQrPayload } from '@/lib/qr-token'

// How long a freshly-issued token's QR is valid for. Long enough to handle
// an extended wait, short enough that a leaked QR doesn't live forever.
// Override per deployment via TOKEN_TTL_HOURS env var if needed.
const DEFAULT_TOKEN_TTL_HOURS = 12

// POST - Join a queue
export async function POST(request: NextRequest) {
  try {
    // Authenticate user from JWT token
    const { user, error: authError } = await authenticateRequest(request)
    if (authError || !user) return authError!

    const body = await request.json()
    const { queueId } = body
    const userId = user.id

    // Validate required fields
    if (!queueId) {
      return errorResponse('Queue ID is required', 400)
    }

    // Check queue exists and is active
    const queue = await db.queue.findUnique({
      where: { id: queueId },
    })

    if (!queue) {
      return errorResponse('Queue not found', 404)
    }

    if (queue.status !== 'ACTIVE') {
      return errorResponse('Queue is not active', 400)
    }

    // Check capacity
    if (queue.currentLength >= queue.maxCapacity) {
      return errorResponse('Queue has reached maximum capacity', 400)
    }

    // Use transaction for ALL atomic operations including duplicate-check, sequence
    // generation, member/token creation and queue length update. The duplicate
    // membership check MUST be inside the transaction to avoid a race where two
    // concurrent joins from the same user both pass the check before either commits.
    let result: {
      member: { id: string }
      token: { id: string; tokenNumber: string }
      position: number
      estimatedWait: number
      qrPayload: string
      tokenExpiresAt: Date
    }
    try {
      result = await db.$transaction(async (tx) => {
        // Re-check membership inside the transaction (race-safe)
        const existingMember = await tx.queueMember.findFirst({
          where: {
            queueId,
            userId,
            status: { in: ['WAITING', 'SERVING'] },
          },
        })
        if (existingMember) {
          throw new Error('ALREADY_IN_QUEUE')
        }

        // Get current waiting count INSIDE transaction for accurate position
        const currentWaiting = await tx.queueMember.count({
          where: { queueId, status: 'WAITING' },
        })
        const position = currentWaiting + 1

        // Get next sequence number INSIDE transaction to prevent race conditions
        const sequenceNum = await getNextSequence(queueId, tx)

        // Generate token number
        const tokenNumber = generateTokenNumber(queue.prefix, sequenceNum)

        // Calculate estimated wait time
        const estimatedWait = estimateWaitTime(queue.avgServiceTime, position)

        // Per-token QR secret + expiry. The QR payload itself is signed with
        // HMAC(JWT_SECRET, tokenId|qrSecret|exp) so a stolen QR can't be
        // forged or extended.
        const ttlHours = Number(process.env.TOKEN_TTL_HOURS) || DEFAULT_TOKEN_TTL_HOURS
        const tokenExpiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
        const qrSecret = generateQrSecret()

        // Create queue member
        const member = await tx.queueMember.create({
          data: {
            queueId,
            userId,
            position,
            status: 'WAITING',
          },
        })

        // Create token (with secure QR fields)
        const token = await tx.token.create({
          data: {
            tokenNumber,
            sequenceNum,
            status: 'WAITING',
            queueId,
            userId,
            estimatedWait,
            qrSecret,
            expiresAt: tokenExpiresAt,
          },
        })

        // Build the signed QR payload string. The client renders this as a QR.
        const qrPayload = signQrPayload({
          tokenId: token.id,
          qrSecret,
          expiresAt: tokenExpiresAt,
        })

        // Update queue length - re-read current queue state inside transaction
        const currentQueue = await tx.queue.findUnique({ where: { id: queueId } })
        if (currentQueue) {
          await tx.queue.update({
            where: { id: queueId },
            data: { currentLength: currentQueue.currentLength + 1 },
          })
        }

        return { member, token, position, estimatedWait, qrPayload, tokenExpiresAt }
      })
    } catch (txError) {
      if ((txError as Error).message === 'ALREADY_IN_QUEUE') {
        return errorResponse('You are already in this queue', 409)
      }
      throw txError
    }

    // Create notification
    await db.notification.create({
      data: {
        userId,
        title: 'Joined Queue',
        message: `You have joined "${queue.name}". Your token is ${result.token.tokenNumber}. Position: ${result.position}. Estimated wait: ${Math.ceil(result.estimatedWait / 60)} minutes.`,
        type: 'QUEUE_UPDATE',
        data: JSON.stringify({
          queueId,
          tokenNumber: result.token.tokenNumber,
          position: result.position,
          estimatedWait: result.estimatedWait,
        }),
      },
    })

    // Broadcast real-time events to all connected clients (admin dashboards, other users)
    // This ensures the admin panel updates immediately when a user joins a queue
    broadcastTokenCreated({
      queueId,
      tokenId: result.token.id,
      tokenNumber: result.token.tokenNumber,
      userId,
      position: result.position,
      estimatedWaitMinutes: Math.ceil(result.estimatedWait / 60),
    })

    broadcastQueueJoined(queueId, userId)

    return successResponse(
      {
        ...result.token,
        position: result.position,
        queueName: queue.name,
        // Signed QR payload, ready to render. The qrSecret never leaves the server.
        qrPayload: result.qrPayload,
        expiresAt: result.tokenExpiresAt,
      },
      'Successfully joined queue',
      201,
    )
  } catch (error) {
    console.error('Join queue error:', error)
    return errorResponse('Internal server error', 500)
  }
}
