import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/types'

export function successResponse<T>(data: T, message?: string, status = 200) {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
  }
  return NextResponse.json(response, { status })
}

export function errorResponse(error: string, status: number) {
  const response: ApiResponse = {
    success: false,
    error,
  }
  return NextResponse.json(response, { status })
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return successResponse({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}
