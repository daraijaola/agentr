import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { agentRoutes } from './routes/agent.js'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'

const app = new Hono()

app.use('*', logger())

app.route('/health', healthRoutes)
app.route('/auth', authRoutes)
app.route('/agent', agentRoutes)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

const port = Number(process.env['API_PORT'] ?? 3000)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[AGENTR API] Running on http://localhost:${port}`)
})
