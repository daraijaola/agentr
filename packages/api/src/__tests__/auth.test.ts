import { describe, it, expect } from 'vitest'
import { SignJWT, jwtVerify } from 'jose'

const SECRET = 'test-secret-key-that-is-long-enough'

function secretKey(s: string): Uint8Array { return new TextEncoder().encode(s) }

async function signToken(tenantId: string, secret: string, ttlSeconds = 86400): Promise<string> {
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey(secret))
}

async function verifyToken(token: string, secret: string): Promise<{ tenantId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ['HS256'] })
    if (typeof payload['tenantId'] !== 'string') return null
    return { tenantId: payload['tenantId'] }
  } catch { return null }
}

describe('Auth token (HS256 JWT via jose)', () => {
  it('signs and verifies a valid token', async () => {
    const token = await signToken('tenant-abc', SECRET)
    const result = await verifyToken(token, SECRET)
    expect(result?.tenantId).toBe('tenant-abc')
  })

  it('rejects token signed with wrong secret', async () => {
    const token = await signToken('tenant-abc', SECRET)
    expect(await verifyToken(token, 'wrong-secret')).toBeNull()
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyToken('notavalidtoken', SECRET)).toBeNull()
    expect(await verifyToken('', SECRET)).toBeNull()
    expect(await verifyToken('a.b.c', SECRET)).toBeNull()
  })

  it('rejects an expired token', async () => {
    // Sign with TTL of -1s (already expired)
    const key = secretKey(SECRET)
    const token = await new SignJWT({ tenantId: 'tenant-abc' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key)
    expect(await verifyToken(token, SECRET)).toBeNull()
  })

  it('rejects a token with tampered payload', async () => {
    const token = await signToken('tenant-abc', SECRET)
    // Replace middle segment (payload) with an attacker payload
    const parts = token.split('.')
    const fakePayload = Buffer.from(JSON.stringify({ tenantId: 'attacker' })).toString('base64url')
    const tampered = `${parts[0]}.${fakePayload}.${parts[2]}`
    expect(await verifyToken(tampered, SECRET)).toBeNull()
  })

  it('rejects a token missing the tenantId claim', async () => {
    const key = secretKey(SECRET)
    const token = await new SignJWT({ someOtherClaim: 'value' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key)
    expect(await verifyToken(token, SECRET)).toBeNull()
  })

  it('does not accept HS512 token when HS256 is required', async () => {
    const key = secretKey(SECRET)
    const token = await new SignJWT({ tenantId: 'tenant-abc' })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key)
    expect(await verifyToken(token, SECRET)).toBeNull()
  })
})
