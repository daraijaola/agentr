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
async function pgRateLimit(ip: string, max: number): Promise<boolean> {
  const pool = getPool()
  const now = Date.now()
  const windowMs = 60_000
  const resetAt = now + windowMs

  try {
    // Upsert: if window expired, reset counter; otherwise increment
    const res = await pool.query<{ count: number }>(
      `INSERT INTO rate_limits (ip, count, reset_at)
       VALUES ($1, 1, $2)
       ON CONFLICT (ip) DO UPDATE
         SET count    = CASE WHEN rate_limits.reset_at < $3 THEN 1
                             ELSE rate_limits.count + 1 END,
             reset_at = CASE WHEN rate_limits.reset_at < $3 THEN $2
                             ELSE rate_limits.reset_at END
       RETURNING count`,
      [ip, resetAt, now]
    )
    const count = res.rows[0]?.count ?? 1
    return count <= max
  } catch (err) {
    // If DB is unavailable, fail open (allow the request) but log
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

const app = new Hono()

app.use('*', logger())
app.use('*', ipRateLimit(120))
app.use('*', cors({ origin: ['https://agentr.online', 'http://localhost:5173'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], credentials: true }))

app.route('/health', healthRoutes)
app.route('/auth', authRoutes)
// Public agent endpoints (no auth required)
// Protected agent endpoints
app.use('/agent/message', authMiddleware)
app.use('/agent/provision', authMiddleware)
app.use('/agent/deprovision', authMiddleware)
app.use('/agent/provider', authMiddleware)
app.route('/agent', agentRoutes)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

const port = Number(process.env['API_PORT'] ?? 3001)

// Init factory + resume active agents on startup
agentFactory.init().then(() => {
  agentFactory.resumeAll().catch(console.error)
})

serve({ fetch: app.fetch, port }, () => {
  console.log(`[AGENTR API] Running on http://localhost:${port}`)
})
