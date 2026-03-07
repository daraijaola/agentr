import { Hono } from 'hono'

export const healthRoutes = new Hono()

healthRoutes.get('/', (c) => {
  return c.json({ status: 'ok', service: 'agentr-api', ts: new Date().toISOString() })
})
