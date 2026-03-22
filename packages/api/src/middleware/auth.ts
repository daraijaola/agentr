import type { Context, Next } from 'hono'
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
  } catch {
    return null
  }
}

export { signToken }

export async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  const secret = process.env['API_SECRET'] ?? 'changeme'
  const payload = verifyToken(token, secret)
  if (!payload) return c.json({ error: 'Invalid token' }, 401)
  c.set('tenantId', payload.tenantId)
  await next()
}
