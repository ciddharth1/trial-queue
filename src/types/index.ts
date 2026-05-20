// ─── ENUM CONSTANTS ─────────────────────────────────────
export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const

export const QueueStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CLOSED: 'CLOSED',
} as const

export const MemberStatus = {
  WAITING: 'WAITING',
  SERVING: 'SERVING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const

export const TokenStatus = {
  WAITING: 'WAITING',
  CALLED: 'CALLED',
  SERVING: 'SERVING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const

export const NotificationType = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  TOKEN_CALLED: 'TOKEN_CALLED',
  QUEUE_UPDATE: 'QUEUE_UPDATE',
} as const

// ─── TYPE ALIASES ───────────────────────────────────────
export type UserRoleType = (typeof UserRole)[keyof typeof UserRole]
export type QueueStatusType = (typeof QueueStatus)[keyof typeof QueueStatus]
export type MemberStatusType = (typeof MemberStatus)[keyof typeof MemberStatus]
export type TokenStatusType = (typeof TokenStatus)[keyof typeof TokenStatus]
export type NotificationTypeType = (typeof NotificationType)[keyof typeof NotificationType]

// ─── API RESPONSE ───────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T = unknown> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── AUTH REQUESTS ──────────────────────────────────────
export interface RegisterRequest {
  email: string
  name: string
  password: string
  phone?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RefreshRequest {
  refreshToken: string
}

// ─── AUTH RESPONSES ─────────────────────────────────────
export interface AuthResponse {
  user: Omit<UserData, 'password'>
  accessToken: string
  refreshToken: string
}

export interface UserData {
  id: string
  email: string
  name: string
  password?: string
  phone: string | null
  avatar: string | null
  role: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

// ─── QUEUE REQUESTS ─────────────────────────────────────
export interface CreateQueueRequest {
  name: string
  description?: string
  prefix?: string
  maxCapacity?: number
  serviceCenterId: string
  scheduledOpen?: string
  scheduledClose?: string
}

export interface UpdateQueueRequest {
  name?: string
  description?: string
  prefix?: string
  status?: string
  maxCapacity?: number
  avgServiceTime?: number
  scheduledOpen?: string
  scheduledClose?: string
}

export interface JoinQueueRequest {
  queueId: string
  userId: string
}

export interface LeaveQueueRequest {
  queueId: string
  userId: string
}

// ─── QUEUE RESPONSES ────────────────────────────────────
export interface QueueData {
  id: string
  name: string
  description: string | null
  prefix: string
  status: string
  maxCapacity: number
  currentLength: number
  avgServiceTime: number
  serviceCenterId: string
  ownerId: string
  qrCode: string | null
  scheduledOpen: string | null
  scheduledClose: string | null
  createdAt: string
  updatedAt: string
}

export interface QueueDetailData extends QueueData {
  waitingCount: number
  servingCount: number
  completedCount: number
  serviceCenter?: {
    id: string
    name: string
  }
}

// ─── TOKEN REQUESTS ─────────────────────────────────────
export interface UpdateTokenRequest {
  status?: string
  serviceCounterId?: string
}

// ─── TOKEN RESPONSES ────────────────────────────────────
export interface TokenData {
  id: string
  tokenNumber: string
  sequenceNum: number
  status: string
  queueId: string
  userId: string
  serviceCounterId: string | null
  calledAt: string | null
  servedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  estimatedWait: number | null
  createdAt: string
  updatedAt: string
}

// ─── SERVICE CENTER REQUESTS ────────────────────────────
export interface CreateServiceCenterRequest {
  name: string
  description?: string
  address?: string
  phone?: string
  email?: string
  logo?: string
}

// ─── NOTIFICATION REQUESTS ──────────────────────────────
export interface MarkNotificationsReadRequest {
  notificationIds?: string[]
  markAll?: boolean
}

// ─── ANALYTICS ──────────────────────────────────────────
export interface AdminOverviewStats {
  totalUsers: number
  activeQueues: number
  tokensServedToday: number
  avgWaitTime: number
  totalServiceCenters: number
  totalTokensToday: number
}

export interface AnalyticsData {
  queueId: string
  date: string
  totalJoined: number
  totalServed: number
  totalCancelled: number
  totalNoShow: number
  avgWaitTime: number
  avgServiceTime: number
  peakHour: number | null
  maxQueueLength: number
}

// ─── JWT PAYLOAD ────────────────────────────────────────
export interface JwtPayload {
  userId: string
  email: string
  role: string
  name?: string
}
