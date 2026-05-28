import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'
import { decodeQrPayload, verifyQrSignature } from '@/lib/qr-token'
import { broadcastTokenServing, broadcastTokenExpired, broadcastQueueUpdate } from '@/lib/socket-broadcast'

// POST /api/token/validate
// Body: { qrPayload: string, serviceCounterId?: string }
//
// Production-grade single-use QR validation, modelled on metro / boarding-pass
// turnstile flows:
//   1. Decode the payload — reject malformed
//   2. Look up the token row (must exist)
//   3. Verify the HMAC signature — rejects forged payloads
//   4. Check expiry — rejects expired payloads
//   5. Check status — only WAITING / CALLED tokens can be consumed
//   6. Check consumedAt — single-use; a token can be validated exactly once
//   7. Atomically mark the token as CONSUMED + status=SERVING
//   8. Log the validation under AdminLog
//   9. Broadcast realtime updates so dashboards see the change
//
// On any failure we respond with a structured `{ valid: false, reason }`
// so the scanner UI can render an explicit error state.
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin(request)
    if (error) return error

    const body = await request.json().catch(() => ({}))
    const qrPayload = typeof body?.qrPayload === 'string' ? body.qrPayload : null
    const serviceCounterId = typeof body?.serviceCounterId === 'string' ? body.serviceCounterId : null

    if (!qrPayload) {
      return errorResponse('qrPayload is required', 400)
    }

    const decoded = decodeQrPayload(qrPayload)
    if (!decoded) {
      return successResponse({ valid: false, reason: 'INVALID_PAYLOAD' }, 'QR is not a QueueSeva token')
    }

    const token = await db.token.findUnique({
      where: { id: decoded.tokenId },
      include: {
        queue: { select: { id: true, name: true, prefix: true, status: true } },
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    if (!token) {
      return successResponse({ valid: false, reason: 'TOKEN_NOT_FOUND' }, 'Token does not exist')
    }
    if (!token.qrSecret) {
      // Legacy tokens (created before QR signing was rolled out) cannot be validated this way.
      return successResponse({ valid: false, reason: 'LEGACY_TOKEN' }, 'This token predates QR validation. Use admin token controls instead.')
    }

    // Verify HMAC signature against the per-token secret
    const sigOk = verifyQrSignature({
      tokenId: decoded.tokenId,
      exp: decoded.exp,
      nonce: decoded.nonce,
      sig: decoded.sig,
      qrSecret: token.qrSecret,
    })
    if (!sigOk) {
      // Log the failed attempt — could be a forgery attempt
      await db.adminLog.create({
        data: {
          userId: user!.id,
          action: 'QR_VALIDATE_FAIL',
          entity: 'Token',
          entityId: token.id,
          details: JSON.stringify({ reason: 'INVALID_SIGNATURE' }),
        },
      }).catch(() => { /* don't block the response on log failure */ })
      return successResponse({ valid: false, reason: 'INVALID_SIGNATURE' }, 'QR signature is invalid')
    }

    // Expiry check — payload exp wins over DB expiresAt because the payload
    // is what the user is presenting. Both must be in the future.
    const now = Date.now()
    const expFromPayload = decoded.exp * 1000
    const expFromDb = token.expiresAt ? token.expiresAt.getTime() : Infinity
    if (expFromPayload < now || expFromDb < now) {
      // Mark the token as expired in the DB if it isn't already
      if (token.status !== 'EXPIRED' && token.status !== 'CANCELLED') {
        await db.token.update({
          where: { id: token.id },
          data: { status: 'EXPIRED' },
        }).catch(() => { /* swallow */ })
        broadcastTokenExpired({
          queueId: token.queueId,
          tokenId: token.id,
          tokenNumber: token.tokenNumber,
          reason: 'TIMEOUT',
        })
        broadcastQueueUpdate(token.queueId, 'QUEUE_UPDATED')
      }
      return successResponse({ valid: false, reason: 'EXPIRED', tokenNumber: token.tokenNumber }, 'QR has expired')
    }

    // Single-use check
    if (token.consumedAt) {
      return successResponse({
        valid: false,
        reason: 'ALREADY_CONSUMED',
        tokenNumber: token.tokenNumber,
        consumedAt: token.consumedAt,
      }, 'QR has already been used')
    }

    // Status check — refuse to validate tokens already cancelled/completed
    if (!['WAITING', 'CALLED'].includes(token.status)) {
      return successResponse({
        valid: false,
        reason: 'WRONG_STATUS',
        status: token.status,
        tokenNumber: token.tokenNumber,
      }, `Token is in status ${token.status}, cannot validate`)
    }

    // Atomically mark consumed. The where-clause guards against races where
    // two concurrent admin scans could otherwise both win.
    const consumedAt = new Date()
    let updatedToken
    try {
      updatedToken = await db.token.update({
        where: { id: token.id, consumedAt: null },
        data: {
          consumedAt,
          validatedBy: user!.id,
          status: 'SERVING',
          servedAt: consumedAt,
          serviceCounterId: serviceCounterId ?? token.serviceCounterId,
          calledAt: token.calledAt ?? consumedAt,
        },
        include: {
          queue: { select: { id: true, name: true, prefix: true } },
          user: { select: { id: true, name: true, email: true, avatar: true } },
          serviceCounter: { select: { id: true, name: true, label: true } },
        },
      })
    } catch (err) {
      // Prisma raises P2025 when the where-clause filtered everything out —
      // means another scan won the race in the microseconds between our
      // earlier check and this update.
      if ((err as { code?: string })?.code === 'P2025') {
        return successResponse({
          valid: false,
          reason: 'ALREADY_CONSUMED',
          tokenNumber: token.tokenNumber,
        }, 'QR was just used by another scanner')
      }
      throw err
    }

    // Move the queue member to SERVING
    await db.queueMember.updateMany({
      where: {
        queueId: token.queueId,
        userId: token.userId,
        status: { in: ['WAITING'] },
      },
      data: { status: 'SERVING', servedAt: consumedAt },
    }).catch(() => { /* log? swallow for now */ })

    // Log the success
    await db.adminLog.create({
      data: {
        userId: user!.id,
        action: 'QR_VALIDATE_OK',
        entity: 'Token',
        entityId: token.id,
        details: JSON.stringify({
          tokenNumber: token.tokenNumber,
          serviceCounterId: serviceCounterId ?? null,
        }),
      },
    }).catch(() => { /* don't block on log failure */ })

    // Broadcast — admin dashboards + the user's own device should both react
    let counterName = 'Counter'
    if (updatedToken.serviceCounterId) {
      counterName = updatedToken.serviceCounter?.name ?? 'Counter'
    }
    broadcastTokenServing({
      queueId: updatedToken.queueId,
      tokenId: updatedToken.id,
      tokenNumber: updatedToken.tokenNumber,
      counterId: updatedToken.serviceCounterId ?? '',
      counterName,
      userId: updatedToken.userId,
    })
    broadcastQueueUpdate(updatedToken.queueId, 'QUEUE_UPDATED')

    // Notify the user that their token was validated
    await db.notification.create({
      data: {
        userId: updatedToken.userId,
        title: 'Token validated',
        message: `Your token ${updatedToken.tokenNumber} was scanned at ${counterName}. Please proceed.`,
        type: 'TOKEN_CALLED',
        data: JSON.stringify({
          tokenId: updatedToken.id,
          tokenNumber: updatedToken.tokenNumber,
          counterName,
        }),
      },
    }).catch(() => { /* swallow */ })

    return successResponse({
      valid: true,
      tokenNumber: updatedToken.tokenNumber,
      tokenId: updatedToken.id,
      consumedAt,
      counter: updatedToken.serviceCounter,
      user: updatedToken.user,
      queue: updatedToken.queue,
    }, 'QR validated')
  } catch (err) {
    console.error('QR validate error:', err)
    return errorResponse('Internal server error', 500)
  }
}
