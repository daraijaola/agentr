import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'

function signToken(tenantId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ tenantId, iat: Date.now() })).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyToken(token: string, secret: string): { tenantId: string } | null {
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null
    const expected = createHmac('sha256', secret).update(payload).digest('base64url')
    if (expected !== sig) return null
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch { return null }
}

describe('Auth token (HMAC-SHA256)', () => {
  const SECRET = 'test-secret-key'

  it('signs and verifies a valid token', () => {
    const token = signToken('tenant-abc', SECRET)
    const result = verifyToken(token, SECRET)
    expect(result?.tenantId).toBe('tenant-abc')
  })

  it('rejects token with wrong secret', () => {
    const token = signToken('tenant-abc', SECRET)
    expect(verifyToken(token, 'wrong-secret')).toBeNull()
  })

  it('rejects malformed token', () => {
    expect(verifyToken('notavalidtoken', SECRET)).toBeNull()
    expect(verifyToken('', SECRET)).toBeNull()
  })

  it('rejects tampered payload', () => {
    const token = signToken('tenant-abc', SECRET)
    const [, sig] = token.split('.')
    const fakePayload = Buffer.from(JSON.stringify({ tenantId: 'attacker' })).toString('base64url')
    expect(verifyToken(`${fakePayload}.${sig}`, SECRET)).toBeNull()
  })
})
