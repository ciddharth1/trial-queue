import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'
import { broadcastTokenExpired, broadcastQueueLeft, broadcastQueueUpdate } from '@/lib/socket-broadcast'

// POST - Leave a queue
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

    // Check queue exists
    const queue = await db.queue.findUnique({ where: { id: queueId } })
    if (!queue) {
      return errorResponse('Queue not found', 404)
    }

    // Find active membership
    const member = await db.queueMember.findFirst({
      where: {
        queueId,
        userId,
        status: { in: ['WAITING', 'SERVING'] },
      },
    })

    if (!member) {
      return errorResponse('You are not in this queue', 404)
    }

    // Find active token
    const token = await db.token.findFirst({
      where: {
        queueId,
        userId,
        status: { in: ['WAITING', 'CALLED', 'SERVING'] },
      },
    })

    // Use transaction for atomic operations (including position recalculation)
    await db.$transaction(async (tx) => {
      // Update member status
      await tx.queueMember.update({
        where: { id: member.id },
        data: {
          status: 'CANCELLED',
          leftAt: new Date(),
        },
      })

      // Update token status if exists
      if (token) {
        await tx.token.update({
          where: { id: token.id },
          data: { status: 'CANCELLED' },
        })
      }

      // Update queue length - recalculate from actual member count
      const activeCount = await tx.queueMember.count({
        where: {
          queueId,
          status: { in: ['WAITING', 'SERVING'] },
        },
      })
      await tx.queue.update({
        where: { id: queueId },
        data: { currentLength: activeCount },
      })

      // Recalculate positions for remaining members within the transaction
      const waitingMembers = await tx.queueMember.findMany({
        where: {
          queueId,
          status: 'WAITING',
        },
        orderBy: { joinedAt: 'asc' },
      })

      await Promise.all(
        waitingMembers.map((m, index) =>
          tx.queueMember.update({
            where: { id: m.id },
            data: { position: index + 1 },
          })
        )
      )
    })

    // Create notification
    await db.notification.create({
      data: {
        userId,
        title: 'Left Queue',
        message: `You have left "${queue.name}". ${token ? `Token ${token.tokenNumber} has been cancelled.` : ''}`,
        type: 'QUEUE_UPDATE',
        data: JSON.stringify({
          queueId,
          tokenNumber: token?.tokenNumber,
        }),
      },
    })

    // Broadcast real-time events so admin dashboards and other users see the change immediately
    broadcastQueueLeft(queueId, userId)
    broadcastQueueUpdate(queueId, 'QUEUE_UPDATED')
    if (token) {
      broadcastTokenExpired({
        queueId,
        tokenId: token.id,
        tokenNumber: token.tokenNumber,
        reason: 'CANCELLED',
      })
    }

    return successResponse(null, 'Successfully left the queue')
  } catch (error) {
    console.error('Leave queue error:', error)
    return errorResponse('Internal server error', 500)
  }
}
