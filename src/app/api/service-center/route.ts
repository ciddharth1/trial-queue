import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse, paginatedResponse } from '@/lib/api-response'

// GET - List service centers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const isActive = searchParams.get('isActive')
    const search = searchParams.get('search')

    const skip = (page - 1) * pageSize

    const where: Record<string, unknown> = {}
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true'
    }
    if (search) {
      where.name = { contains: search }
    }

    const [centers, total] = await Promise.all([
      db.serviceCenter.findMany({
        where,
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { queues: true, counters: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.serviceCenter.count({ where }),
    ])

    const formatted = centers.map((center) => ({
      id: center.id,
      name: center.name,
      description: center.description,
      address: center.address,
      phone: center.phone,
      email: center.email,
      logo: center.logo,
      isActive: center.isActive,
      ownerId: center.ownerId,
      owner: center.owner,
      queueCount: center._count.queues,
      counterCount: center._count.counters,
      createdAt: center.createdAt,
      updatedAt: center.updatedAt,
    }))

    return paginatedResponse(formatted, total, page, pageSize)
  } catch (error) {
    console.error('List service centers error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST - Create service center (admin only)
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin(request)
    if (error) return error

    const body = await request.json()
    const { name, description, address, phone, email, logo } = body

    // Validate required fields
    if (!name || name.trim().length < 2) {
      return errorResponse('Service center name is required (min 2 characters)', 400)
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return errorResponse('Invalid email format', 400)
      }
    }

    // Create service center
    const serviceCenter = await db.serviceCenter.create({
      data: {
        name: name.trim(),
        description: description || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        logo: logo || null,
        ownerId: user!.id,
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    // Log admin action
    await db.adminLog.create({
      data: {
        userId: user!.id,
        action: 'CREATE_SERVICE_CENTER',
        entity: 'ServiceCenter',
        entityId: serviceCenter.id,
        details: JSON.stringify({ name: serviceCenter.name }),
      },
    })

    return successResponse(serviceCenter, 'Service center created successfully', 201)
  } catch (error) {
    console.error('Create service center error:', error)
    return errorResponse('Internal server error', 500)
  }
}
