// Verification of the secure QR token signing + validation flow.
// Tests the crypto primitives directly. The full HTTP validation flow gets
// covered by the smoke-test against a running server.

import { signQrPayload, decodeQrPayload, verifyQrSignature, generateQrSecret } from '../src/lib/qr-token.ts'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'verification-secret-not-for-production'

let pass = 0
let fail = 0
function check(label, cond, detail) {
  if (cond) {
    pass++
    console.log(`✓ ${label}`)
  } else {
    fail++
    console.log(`✗ ${label}`, detail || '')
  }
}

const tokenId = 'cm00000token000aaa'
const qrSecret = generateQrSecret()
const expiresAt = new Date(Date.now() + 60_000) // 60s in the future

// 1. Sign + decode round-trip
const payload = signQrPayload({ tokenId, qrSecret, expiresAt })
check('signQrPayload returns a string starting with qsv1:', typeof payload === 'string' && payload.startsWith('qsv1:'))

const decoded = decodeQrPayload(payload)
check('decodeQrPayload returns a structured payload', decoded && decoded.tokenId === tokenId)

// 2. Signature verifies with the right qrSecret
const okWithRightSecret = decoded ? verifyQrSignature({ ...decoded, qrSecret }) : false
check('verifyQrSignature accepts a correctly-signed payload', okWithRightSecret)

// 3. Signature rejects with the wrong qrSecret (unforgeability)
const wrongSecret = generateQrSecret()
const okWithWrongSecret = decoded ? verifyQrSignature({ ...decoded, qrSecret: wrongSecret }) : true
check('verifyQrSignature REJECTS a payload with wrong qrSecret', !okWithWrongSecret)

// 4. Signature rejects after tampering with tokenId
const tampered = decoded ? verifyQrSignature({ ...decoded, tokenId: 'cm00000DIFFERENT', qrSecret }) : true
check('verifyQrSignature REJECTS after tokenId tamper', !tampered)

// 5. Signature rejects after tampering with exp
const expTamper = decoded ? verifyQrSignature({ ...decoded, exp: decoded.exp + 9999, qrSecret }) : true
check('verifyQrSignature REJECTS after exp tamper', !expTamper)

// 6. Signature rejects after tampering with the signature itself
const sigTamper = decoded ? verifyQrSignature({ ...decoded, sig: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', qrSecret }) : true
check('verifyQrSignature REJECTS after sig tamper', !sigTamper)

// 7. decodeQrPayload returns null for non-QSV payloads
check('decodeQrPayload returns null for non-QSV strings', decodeQrPayload('https://example.com/random') === null)
check('decodeQrPayload returns null for empty string', decodeQrPayload('') === null)
check('decodeQrPayload returns null for malformed payload', decodeQrPayload('qsv1:xxxxxxxx') === null)

// 8. Each sign call uses a fresh nonce (prevents identical-looking QR images
//    from being de-duped by some scanners)
const a = signQrPayload({ tokenId, qrSecret, expiresAt })
const b = signQrPayload({ tokenId, qrSecret, expiresAt })
check('signQrPayload uses a fresh nonce each call (no replay artifact)', a !== b)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
