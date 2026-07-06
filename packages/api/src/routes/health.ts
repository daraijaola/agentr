import { Hono } from 'hono'
import { getPool, agentFactory } from '@agentr/factory'

export const healthRoutes = new Hono()

const startedAt = Date.now()

// GET /health — liveness check (no auth required)
healthRoutes.get('/', (c) => {
  return c.json({ status: 'ok', uptime: Math.floor((Date.now() - startedAt) / 1000) })
})

// GET /health/ready — readiness check: DB ping + active agent count
healthRoutes.get('/ready', async (c) => {
  const checks: Record<string, 'ok' | 'error'> = {}
  let dbOk = false

  try {
    await getPool().query('SELECT 1')
    checks['database'] = 'ok'
    dbOk = true
  } catch {
    checks['database'] = 'error'
  }

  return c.json(
    {
      status: dbOk ? 'ready' : 'degraded',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      activeAgents: agentFactory.activeCount(),
      checks,
    },
    dbOk ? 200 : 503
  )
})
