import { Hono } from 'hono'

export const agentRoutes = new Hono()

// GET /agent/status  get agent status for authenticated user
agentRoutes.get('/status', async (c) => {
  // TODO: get tenantId from auth middleware, return agent status
  return c.json({ status: 'pending', message: 'Agent not yet provisioned' })
})

// POST /agent/message  send message to agent
agentRoutes.post('/message', async (c) => {
  const body = await c.req.json()
  // TODO: route message to AgentRuntime for this tenant
  return c.json({ reply: `Echo: ${body.message}` })
})

// POST /agent/provision  provision new agent after payment
agentRoutes.post('/provision', async (c) => {
  // TODO: AgentFactory.provision(tenantId)
  return c.json({ success: true, message: 'Agent provisioning started' })
})
