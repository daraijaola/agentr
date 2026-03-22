import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { agentRoutes } from './routes/agent.js'
import { authRoutes } from './routes/auth.js'
import { authMiddleware } from './middleware/auth.js'
import { healthRoutes } from './routes/health.js'
import { agentFactory } from '@agentr/factory'
import { cors } from 'hono/cors'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function ipRateLimit(max: number) {
  return async (c: any, next: any) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? 'unknown'
    const now = Date.now()
    const entry = rateLimitMap.get(ip)
    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    } else {
      entry.count++
      if (entry.count > max) {
        return c.json({ error: 'Too many requests' }, 429)
      }
    }
    await next()
  }
}

const app = new Hono()

app.use('*', logger())
app.use('*', ipRateLimit(120))
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }))

app.route('/health', healthRoutes)
app.route('/auth', authRoutes)
app.use('/agent/*', authMiddleware)
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
