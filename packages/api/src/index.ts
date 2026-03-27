import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
// Load .env from repo root — always override so .env is the source of truth
loadEnv({ path: resolve(process.cwd(), '.env'), override: true })

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { agentRoutes } from './routes/agent.js'
import { authRoutes } from './routes/auth.js'
import { authMiddleware } from './middleware/auth.js'
import { healthRoutes } from './routes/health.js'
import { agentFactory, getPool } from '@agentr/factory'
import { cors } from 'hono/cors'

// PostgreSQL-backed rate limiter — survives process restarts
// `key` can be an IP address or any unique identifier (e.g. "tenant:<id>")
async function pgRateLimit(key: string, max: number, windowMs = 60_000): Promise<boolean> {
  const pool = getPool()
  const now = Date.now()
  const resetAt = now + windowMs

  try {
    const res = await pool.query<{ count: number }>(
      `INSERT INTO rate_limits (ip, count, reset_at)
       VALUES ($1, 1, $2)
       ON CONFLICT (ip) DO UPDATE
         SET count    = CASE WHEN rate_limits.reset_at < $3 THEN 1
                             ELSE rate_limits.count + 1 END,
             reset_at = CASE WHEN rate_limits.reset_at < $3 THEN $2
                             ELSE rate_limits.reset_at END
       RETURNING count`,
      [key, resetAt, now]
    )
    const count = res.rows[0]?.count ?? 1
    return count <= max
  } catch (err) {
    console.error('[RateLimit] DB error, failing open:', err)
    return true
  }
}

function ipRateLimit(max: number) {
  return async (c: any, next: any) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? 'unknown'
    const allowed = await pgRateLimit(ip, max)
    if (!allowed) return c.json({ error: 'Too many requests' }, 429)
    await next()
  }
}

// Per-tenant rate limit — applied after authMiddleware so tenantId is available
function tenantRateLimit(max: number, windowMs = 60_000) {
  return async (c: any, next: any) => {
    const tenantId = c.get('tenantId') as string | undefined
    if (!tenantId) return next()
    const allowed = await pgRateLimit(`tenant:${tenantId}`, max, windowMs)
    if (!allowed) return c.json({ error: 'Too many requests — slow down' }, 429)
    await next()
  }
}

const app = new Hono()

app.use('*', logger())
app.use('*', ipRateLimit(120))
const allowedOrigins = process.env['NODE_ENV'] === 'production'
  ? ['https://agentr.online']
  : ['https://agentr.online', 'http://localhost:5173', 'http://localhost:3000']

app.use('*', cors({ origin: allowedOrigins, allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], credentials: true }))

app.route('/health', healthRoutes)
app.route('/auth', authRoutes)
// Protected agent endpoints (require auth token)
app.use('/agent/message', authMiddleware)
app.use('/agent/message', tenantRateLimit(30)) // 30 messages/min per tenant
app.use('/agent/provision', authMiddleware)
app.use('/agent/deprovision', authMiddleware)
app.use('/agent/provider', authMiddleware)
app.use('/agent/start-trial', authMiddleware)
app.use('/agent/setup', authMiddleware)
app.use('/agent/activity/*', authMiddleware)
app.use('/agent/credits-usage/*', authMiddleware)
app.use('/agent/credits/*', authMiddleware)
app.use('/agent/workspace/*', authMiddleware)
app.use('/agent/processes/*', authMiddleware)
app.use('/agent/logs/*', authMiddleware)
app.use('/agent/process/stop', authMiddleware)
app.use('/agent/marketplace/deploy', authMiddleware)
app.use('/agent/trial-expire/*', authMiddleware)

// Protect DELETE /agent/:tenantId — prevents unauthenticated deprovisioning
app.use('/agent/:tenantId', async (c, next) => {
  if (c.req.method === 'DELETE') return authMiddleware(c, next)
  return next()
})

// Admin endpoints get a tighter per-IP limit (10 req/min)
app.use('/agent/admin/*', ipRateLimit(10))

app.route('/agent', agentRoutes)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// Prevent unhandled rejections/exceptions from crashing the process
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err)
})

const port = Number(process.env['API_PORT'] ?? 3001)

// Init factory + resume active agents on startup
agentFactory.init().then(() => {
  agentFactory.resumeAll().catch(console.error)
})

serve({ fetch: app.fetch, port }, () => {
  console.log(`[AGENTR API] Running on http://localhost:${port}`)
})
