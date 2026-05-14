import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api-response'
import { generateQRCodeData } from '@/lib/queue-utils'

// GET - List queues with pagination and filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const status = searchParams.get('status')
    const serviceCenterId = searchParams.get('serviceCenterId')
    const search = searchParams.get('search')

    const skip = (page - 1) * pageSize

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (serviceCenterId) where.serviceCenterId = serviceCenterId
    if (search) {
      where.name = { contains: search }
    }

    const [queues, total] = await Promise.all([
      db.queue.findMany({
        where,
        include: {
          serviceCenter: {
            select: { id: true, name: true },
          },
          _count: {
            select: {
              queueMembers: {
                where: { status: { in: ['WAITING', 'SERVING'] } },
              },
              tokens: {
                where: { status: 'WAITING' },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.queue.count({ where }),
    ])

    const formattedQueues = queues.map((queue) => ({
      id: queue.id,
      name: queue.name,
      description: queue.description,
      prefix: queue.prefix,
      status: queue.status,
      maxCapacity: queue.maxCapacity,
      currentLength: queue.currentLength,
      avgServiceTime: queue.avgServiceTime,
      serviceCenterId: queue.serviceCenterId,
      ownerId: queue.ownerId,
      qrCode: queue.qrCode,
      scheduledOpen: queue.scheduledOpen,
      scheduledClose: queue.scheduledClose,
      createdAt: queue.createdAt,
      updatedAt: queue.updatedAt,
      waitingCount: queue._count.queueMembers,
      serviceCenter: queue.serviceCenter,
    }))

    return paginatedResponse(formattedQueues, total, page, pageSize)
  } catch (error) {
    console.error('List queues error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST - Create new queue (admin only)
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin(request)
    if (error) return error

    const body = await request.json()
    const { name, description, prefix, maxCapacity, serviceCenterId, scheduledOpen, scheduledClose } = body

    // Validate required fields
    if (!name || !serviceCenterId) {
      return errorResponse('Name and serviceCenterId are required', 400)
    }

    if (name.trim().length < 2) {
      return errorResponse('Queue name must be at least 2 characters', 400)
    }

    // Validate prefix
    const tokenPrefix = prefix?.toUpperCase() || 'A'
    if (tokenPrefix.length > 3) {
      return errorResponse('Prefix must be 1-3 characters', 400)
    }

    // Validate capacity
    const capacity = maxCapacity || 100
    if (capacity < 1 || capacity > 10000) {
      return errorResponse('Max capacity must be between 1 and 10000', 400)
    }

    // Check service center exists
    const serviceCenter = await db.serviceCenter.findUnique({
      where: { id: serviceCenterId },
    })
    if (!serviceCenter) {
      return errorResponse('Service center not found', 404)
    }

    // Generate QR code data
    const qrCode = generateQRCodeData('', name, tokenPrefix)

    // Create queue
    const queue = await db.queue.create({
      data: {
        name: name.trim(),
        description: description || null,
        prefix: tokenPrefix,
        maxCapacity: capacity,
        serviceCenterId,
        ownerId: user!.id,
        qrCode,
        scheduledOpen: scheduledOpen ? new Date(scheduledOpen) : null,
        scheduledClose: scheduledClose ? new Date(scheduledClose) : null,
      },
      include: {
        serviceCenter: {
          select: { id: true, name: true },
        },
      },
    })

    // Update QR code with actual queue ID
    const finalQrCode = generateQRCodeData(queue.id, queue.name, queue.prefix)
    await db.queue.update({
      where: { id: queue.id },
      data: { qrCode: finalQrCode },
    })

    // Log admin action
    await db.adminLog.create({
      data: {
        userId: user!.id,
        action: 'CREATE_QUEUE',
        entity: 'Queue',
        entityId: queue.id,
        details: JSON.stringify({ name: queue.name, serviceCenterId }),
      },
    })

    return successResponse(
      { ...queue, qrCode: finalQrCode },
      'Queue created successfully',
      201,
    )
  } catch (error) {
    console.error('Create queue error:', error)
    return errorResponse('Internal server error', 500)
  }
}
