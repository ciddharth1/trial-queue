// ─── Secure QR token signing & verification ─────────────────────────
//
// Goal: produce a QR payload that
//   1. is unforgeable without the server's JWT_SECRET (HMAC-SHA256)
//   2. is single-use (consumedAt enforced at validation time)
//   3. expires (signature carries an expiry timestamp; expired tokens are rejected)
//   4. is opaque to clients but small enough to render as a printable QR
//
// We pack the data as a single base64url-encoded string of
//   `${tokenId}.${exp}.${nonce}.${signature}`
// where signature = HMAC-SHA256(JWT_SECRET, `${tokenId}.${exp}.${nonce}.${qrSecret}`)
//
// The qrSecret is a per-token random salt stored alongside the token row.
// Without DB access, an attacker cannot reconstruct the signature even if they
// somehow guess JWT_SECRET, and without JWT_SECRET they can't sign payloads
// even with DB access. Two-factor signing.

import crypto from 'crypto'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET is required for QR signing')
  }
  return secret
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

export function generateQrSecret(): string {
  return crypto.randomBytes(16).toString('base64url')
}

interface SignedPayload {
  tokenId: string
  exp: number // unix seconds
  nonce: string
}

/**
 * Build a signed, expiring QR payload string for the given token.
 * `qrSecret` must be the per-token salt persisted in the Token row.
 */
export function signQrPayload(opts: {
  tokenId: string
  qrSecret: string
  expiresAt: Date
  nonce?: string
}): string {
  const exp = Math.floor(opts.expiresAt.getTime() / 1000)
  const nonce = opts.nonce ?? crypto.randomBytes(8).toString('base64url')
  const base = `${opts.tokenId}.${exp}.${nonce}`
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(`${base}.${opts.qrSecret}`)
    .digest()
  // We bundle the payload as a small JSON object with a stable shape so the
  // scanner UI can also surface preview info without round-tripping the server.
  // The server still re-verifies at validation time.
  const wire = {
    v: 1,                    // payload version
    t: opts.tokenId,
    e: exp,
    n: nonce,
    s: b64url(sig),
  }
  return `qsv1:${b64url(JSON.stringify(wire))}`
}

/**
 * Decode a QR payload string. Returns null if it isn't ours.
 * Verification (signature + expiry + single-use) happens server-side.
 */
export function decodeQrPayload(raw: string): { tokenId: string; exp: number; nonce: string; sig: string } | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed.startsWith('qsv1:')) return null
  try {
    const json = JSON.parse(fromB64url(trimmed.slice('qsv1:'.length)).toString('utf8'))
    if (!json || json.v !== 1) return null
    if (typeof json.t !== 'string' || typeof json.e !== 'number' || typeof json.n !== 'string' || typeof json.s !== 'string') {
      return null
    }
    return { tokenId: json.t, exp: json.e, nonce: json.n, sig: json.s }
  } catch {
    return null
  }
}

/**
 * Verify a decoded payload's signature against the server's secret + the token's qrSecret.
 * Constant-time comparison.
 */
export function verifyQrSignature(opts: {
  tokenId: string
  exp: number
  nonce: string
  sig: string
  qrSecret: string
}): boolean {
  const base = `${opts.tokenId}.${opts.exp}.${opts.nonce}`
  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(`${base}.${opts.qrSecret}`)
    .digest()
  let provided: Buffer
  try {
    provided = fromB64url(opts.sig)
  } catch {
    return false
  }
  if (provided.length !== expected.length) return false
  return crypto.timingSafeEqual(provided, expected)
}
