import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

// GET - Get queue details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const queue = await db.queue.findUnique({
      where: { id },
      include: {
        serviceCenter: {
          select: { id: true, name: true, address: true, phone: true },
        },
        tokens: {
          where: { status: { in: ['WAITING', 'CALLED', 'SERVING'] } },
          orderBy: { sequenceNum: 'asc' },
          take: 20,
        },
      },
    })

    if (!queue) {
      return errorResponse('Queue not found', 404)
    }

    // Get counts
    const [waitingCount, servingCount, completedCount] = await Promise.all([
      db.token.count({ where: { queueId: id, status: 'WAITING' } }),
      db.token.count({ where: { queueId: id, status: { in: ['CALLED', 'SERVING'] } } }),
      db.token.count({ where: { queueId: id, status: 'COMPLETED' } }),
    ])

    return successResponse({
      ...queue,
      waitingCount,
      servingCount,
      completedCount,
    })
  } catch (error) {
    console.error('Get queue error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// PATCH - Update queue
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { user, error } = await requireAdmin(request)
    if (error) return error

    const body = await request.json()
    const { name, description, prefix, status, maxCapacity, avgServiceTime, scheduledOpen, scheduledClose } = body

    // Check queue exists
    const existingQueue = await db.queue.findUnique({ where: { id } })
    if (!existingQueue) {
      return errorResponse('Queue not found', 404)
    }

    // Validate status
    if (status && !['ACTIVE', 'PAUSED', 'CLOSED'].includes(status)) {
      return errorResponse('Invalid status. Must be ACTIVE, PAUSED, or CLOSED', 400)
    }

    // Validate capacity
    if (maxCapacity !== undefined && (maxCapacity < 1 || maxCapacity > 10000)) {
      return errorResponse('Max capacity must be between 1 and 10000', 400)
    }

    // Validate avgServiceTime
    if (avgServiceTime !== undefined && avgServiceTime < 0) {
      return errorResponse('Average service time must be positive', 400)
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description
    if (prefix !== undefined) updateData.prefix = prefix.toUpperCase()
    if (status !== undefined) updateData.status = status
    if (maxCapacity !== undefined) updateData.maxCapacity = maxCapacity
    if (avgServiceTime !== undefined) updateData.avgServiceTime = avgServiceTime
    if (scheduledOpen !== undefined) updateData.scheduledOpen = scheduledOpen ? new Date(scheduledOpen) : null
    if (scheduledClose !== undefined) updateData.scheduledClose = scheduledClose ? new Date(scheduledClose) : null

    const queue = await db.queue.update({
      where: { id },
      data: updateData,
      include: {
        serviceCenter: {
          select: { id: true, name: true },
        },
      },
    })

    // Log admin action
    await db.adminLog.create({
      data: {
        userId: user!.id,
        action: 'UPDATE_QUEUE',
        entity: 'Queue',
        entityId: id,
        details: JSON.stringify(updateData),
      },
    })

    return successResponse(queue, 'Queue updated successfully')
  } catch (error) {
    console.error('Update queue error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// DELETE - Close/delete queue
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { user, error } = await requireAdmin(request)
    if (error) return error

    // Check queue exists
    const existingQueue = await db.queue.findUnique({ where: { id } })
    if (!existingQueue) {
      return errorResponse('Queue not found', 404)
    }

    // Check if there are active tokens
    const activeTokens = await db.token.count({
      where: {
        queueId: id,
        status: { in: ['WAITING', 'CALLED', 'SERVING'] },
      },
    })

    if (activeTokens > 0) {
      // Close the queue instead of deleting if there are active tokens
      await db.queue.update({
        where: { id },
        data: { status: 'CLOSED' },
      })

      // Cancel all waiting tokens
      await db.token.updateMany({
        where: {
          queueId: id,
          status: 'WAITING',
        },
        data: {
          status: 'CANCELLED',
        },
      })

      // Update all waiting members
      await db.queueMember.updateMany({
        where: {
          queueId: id,
          status: 'WAITING',
        },
        data: {
          status: 'CANCELLED',
          leftAt: new Date(),
        },
      })

      await db.queue.update({
        where: { id },
        data: { currentLength: 0 },
      })
    } else {
      // Delete the queue if no active tokens
      await db.queue.delete({ where: { id } })
    }

    // Log admin action
    await db.adminLog.create({
      data: {
        userId: user!.id,
        action: activeTokens > 0 ? 'CLOSE_QUEUE' : 'DELETE_QUEUE',
        entity: 'Queue',
        entityId: id,
        details: JSON.stringify({ hadActiveTokens: activeTokens > 0 }),
      },
    })

    return successResponse(
      null,
      activeTokens > 0 ? 'Queue closed and waiting tokens cancelled' : 'Queue deleted successfully',
    )
  } catch (error) {
    console.error('Delete queue error:', error)
    return errorResponse('Internal server error', 500)
  }
}
