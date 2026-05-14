import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'
import { generateTokenNumber, estimateWaitTime, getNextSequence } from '@/lib/queue-utils'

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

    // Check if user already has an active membership in this queue
    const existingMember = await db.queueMember.findFirst({
      where: {
        queueId,
        userId,
        status: { in: ['WAITING', 'SERVING'] },
      },
    })

    if (existingMember) {
      return errorResponse('You are already in this queue', 409)
    }

    // Get next position
    const currentWaiting = await db.queueMember.count({
      where: { queueId, status: 'WAITING' },
    })
    const position = currentWaiting + 1

    // Get next sequence number
    const sequenceNum = await getNextSequence(queueId)

    // Generate token number
    const tokenNumber = generateTokenNumber(queue.prefix, sequenceNum)

    // Calculate estimated wait time
    const estimatedWait = estimateWaitTime(queue.avgServiceTime, position)

    // Use transaction for atomic operations
    const result = await db.$transaction(async (tx) => {
      // Create queue member
      const member = await tx.queueMember.create({
        data: {
          queueId,
          userId,
          position,
          status: 'WAITING',
        },
      })

      // Create token
      const token = await tx.token.create({
        data: {
          tokenNumber,
          sequenceNum,
          status: 'WAITING',
          queueId,
          userId,
          estimatedWait,
        },
      })

      // Update queue length
      await tx.queue.update({
        where: { id: queueId },
        data: { currentLength: queue.currentLength + 1 },
      })

      return { member, token }
    })

    // Create notification
    await db.notification.create({
      data: {
        userId,
        title: 'Joined Queue',
        message: `You have joined "${queue.name}". Your token is ${tokenNumber}. Position: ${position}. Estimated wait: ${Math.ceil(estimatedWait / 60)} minutes.`,
        type: 'QUEUE_UPDATE',
        data: JSON.stringify({
          queueId,
          tokenNumber,
          position,
          estimatedWait,
        }),
      },
    })

    return successResponse(
      {
        ...result.token,
        position,
        queueName: queue.name,
      },
      'Successfully joined queue',
      201,
    )
  } catch (error) {
    console.error('Join queue error:', error)
    return errorResponse('Internal server error', 500)
  }
}
