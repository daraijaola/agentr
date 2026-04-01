import type { Context, Next } from 'hono'
import { SignJWT, jwtVerify } from 'jose'

const TOKEN_TTL_SECONDS = 24 * 60 * 60 // 24 hours

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

function getSecret(): string {
  const secret = process.env['API_SECRET']
  if (!secret) throw new Error('API_SECRET environment variable is not set')
  return secret
}

async function signToken(tenantId: string, secret: string): Promise<string> {
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecretKey(secret))
}

async function verifyToken(token: string, secret: string): Promise<{ tenantId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(secret), { algorithms: ['HS256'] })
    if (typeof payload['tenantId'] !== 'string') return null
    return { tenantId: payload['tenantId'] }
  } catch {
    return null
  }
}

export { signToken, getSecret }

export async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  let secret: string
  try {
    secret = getSecret()
  } catch {
    return c.json({ error: 'Server misconfiguration: API_SECRET is not set' }, 500)
  }
  const payload = await verifyToken(token, secret)
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 401)
  c.set('tenantId', payload.tenantId)
  await next()
}
