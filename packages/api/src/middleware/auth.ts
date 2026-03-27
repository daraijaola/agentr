import type { Context, Next } from 'hono'
import { createHmac } from 'crypto'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function getSecret(): string {
  const secret = process.env['API_SECRET']
  if (!secret) throw new Error('API_SECRET environment variable is not set')
  return secret
}

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
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { tenantId: string; iat: number }
    // Enforce 24-hour TTL
    if (!parsed.iat || Date.now() - parsed.iat > TOKEN_TTL_MS) return null
    return { tenantId: parsed.tenantId }
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
  const payload = verifyToken(token, secret)
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 401)
  c.set('tenantId', payload.tenantId)
  await next()
}
