import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'
import { recalculatePositions } from '@/lib/queue-utils'
import { broadcastTokenCalled, broadcastTokenServing, broadcastTokenCompleted, broadcastTokenExpired, broadcastQueueUpdate } from '@/lib/socket-broadcast'

// GET - Get token details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Authenticate the user
    const { user, error: authError } = await authenticateRequest(request)
    if (authError || !user) return authError!

    const { id } = await params

    const token = await db.token.findUnique({
      where: { id },
      include: {
        queue: {
          select: { id: true, name: true, prefix: true, status: true, avgServiceTime: true },
        },
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        serviceCounter: {
          select: { id: true, name: true, label: true },
        },
      },
    })

    if (!token) {
      return errorResponse('Token not found', 404)
    }

    // Non-admin users can only view their own tokens
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && token.userId !== user.id) {
      return errorResponse('Access denied', 403)
    }

    // Calculate current position if still waiting
    let currentPosition: number | null = null
    if (token.status === 'WAITING') {
      currentPosition = await db.token.count({
        where: {
          queueId: token.queueId,
          status: 'WAITING',
          sequenceNum: { lte: token.sequenceNum },
        },
      })
    }

    return successResponse({
      ...token,
      currentPosition,
    })
  } catch (error) {
    console.error('Get token error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// PATCH - Update token status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { user, error: authError } = await requireAdmin(request)
    if (authError) return authError

    const body = await request.json()
    const { status, serviceCounterId } = body

    // Find token
    const existingToken = await db.token.findUnique({
      where: { id },
      include: { queue: true },
    })

    if (!existingToken) {
      return errorResponse('Token not found', 404)
    }

    // Validate status transitions
    const validStatuses = ['WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'EXPIRED', 'CANCELLED']
    if (status && !validStatuses.includes(status)) {
      return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400)
    }

    const updateData: Record<string, unknown> = {}

    if (status) {
      updateData.status = status

      // Set timestamps based on status
      if (status === 'CALLED') {
        updateData.calledAt = new Date()
        if (serviceCounterId) {
          updateData.serviceCounterId = serviceCounterId
        }
      } else if (status === 'SERVING') {
        updateData.servedAt = new Date()
        if (serviceCounterId) {
          updateData.serviceCounterId = serviceCounterId
        }
      } else if (status === 'COMPLETED') {
        updateData.completedAt = new Date()
        if (!existingToken.calledAt) updateData.calledAt = new Date()
        if (!existingToken.servedAt) updateData.servedAt = new Date()
      } else if (status === 'EXPIRED') {
        updateData.expiresAt = new Date()
      }
    }

    if (serviceCounterId !== undefined) {
      updateData.serviceCounterId = serviceCounterId
    }

    const updatedToken = await db.token.update({
      where: { id },
      data: updateData,
      include: {
        queue: {
          select: { id: true, name: true, prefix: true },
        },
        user: {
          select: { id: true, name: true },
        },
        serviceCounter: {
          select: { id: true, name: true, label: true },
        },
      },
    })

    // If token is called or completed, create notification
    if (status === 'CALLED') {
      await db.notification.create({
        data: {
          userId: existingToken.userId,
          title: 'Token Called',
          message: `Your token ${existingToken.tokenNumber} has been called! Please proceed to the counter.`,
          type: 'TOKEN_CALLED',
          data: JSON.stringify({
            tokenId: id,
            tokenNumber: existingToken.tokenNumber,
            queueId: existingToken.queueId,
            serviceCounterId: serviceCounterId || existingToken.serviceCounterId,
          }),
        },
      })
    }

    // Update queue member status accordingly
    if (status === 'SERVING' || status === 'COMPLETED' || status === 'CANCELLED' || status === 'EXPIRED') {
      const memberStatus = status === 'SERVING' ? 'SERVING' :
        status === 'COMPLETED' ? 'COMPLETED' :
        status === 'CANCELLED' ? 'CANCELLED' : 'NO_SHOW'

      const memberUpdateData: Record<string, unknown> = { status: memberStatus }
      if (memberStatus === 'SERVING') memberUpdateData.servedAt = new Date()
      if (memberStatus === 'COMPLETED' || memberStatus === 'CANCELLED' || memberStatus === 'NO_SHOW') {
        memberUpdateData.leftAt = new Date()
      }

      await db.queueMember.updateMany({
        where: {
          queueId: existingToken.queueId,
          userId: existingToken.userId,
          status: { in: ['WAITING', 'SERVING'] },
        },
        data: memberUpdateData,
      })

      // Update queue length
      if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'EXPIRED') {
        const newLength = await db.queueMember.count({
          where: {
            queueId: existingToken.queueId,
            status: { in: ['WAITING', 'SERVING'] },
          },
        })
        await db.queue.update({
          where: { id: existingToken.queueId },
          data: { currentLength: newLength },
        })

        // Recalculate positions for remaining waiting members
        await recalculatePositions(existingToken.queueId)
      }
    }

    // Log admin action
    await db.adminLog.create({
      data: {
        userId: user!.id,
        action: 'UPDATE_TOKEN',
        entity: 'Token',
        entityId: id,
        details: JSON.stringify({ status, serviceCounterId }),
      },
    })

    // Resolve counter name from database instead of hardcoding "Counter 1"
    const effectiveCounterId = serviceCounterId || existingToken.serviceCounterId
    let counterName = 'Counter'
    if (effectiveCounterId) {
      const counter = await db.serviceCounter.findUnique({
        where: { id: effectiveCounterId },
        select: { name: true },
      })
      counterName = counter?.name || 'Counter'
    }

    // Broadcast real-time socket events so all dashboards update immediately
    if (status === 'CALLED') {
      broadcastTokenCalled({
        queueId: existingToken.queueId,
        tokenId: id,
        tokenNumber: existingToken.tokenNumber,
        counterId: effectiveCounterId || '',
        counterName,
        userId: existingToken.userId,
      })
      broadcastQueueUpdate(existingToken.queueId, 'QUEUE_UPDATED')
    } else if (status === 'SERVING') {
      broadcastTokenServing({
        queueId: existingToken.queueId,
        tokenId: id,
        tokenNumber: existingToken.tokenNumber,
        counterId: effectiveCounterId || '',
        counterName,
        userId: existingToken.userId,
      })
    } else if (status === 'COMPLETED') {
      broadcastTokenCompleted({
        queueId: existingToken.queueId,
        tokenId: id,
        tokenNumber: existingToken.tokenNumber,
        counterId: effectiveCounterId || '',
        counterName,
        userId: existingToken.userId,
      })
      broadcastQueueUpdate(existingToken.queueId, 'QUEUE_UPDATED')
    } else if (status === 'EXPIRED' || status === 'CANCELLED') {
      broadcastTokenExpired({
        queueId: existingToken.queueId,
        tokenId: id,
        tokenNumber: existingToken.tokenNumber,
        reason: status === 'CANCELLED' ? 'CANCELLED' : 'TIMEOUT',
      })
      broadcastQueueUpdate(existingToken.queueId, 'QUEUE_UPDATED')
    }

    return successResponse(updatedToken, 'Token updated successfully')
  } catch (error) {
    console.error('Update token error:', error)
    return errorResponse('Internal server error', 500)
  }
}
