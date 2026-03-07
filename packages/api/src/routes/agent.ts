import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { bridgeManager } from '@agentr/core'

export const agentRoutes = new Hono()

// GET /agent/status
agentRoutes.get('/status/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  const client = bridgeManager.get(tenantId)

  if (!client) {
    return c.json({ status: 'offline', tenantId })
  }

  const me = client.getMe()
  return c.json({
    status: client.isConnected() ? 'online' : 'offline',
    tenantId,
    telegram: me ? {
      username: me.username,
      firstName: me.firstName,
      phone: me.phone,
    } : null,
  })
})

// POST /agent/message  send message through agent
agentRoutes.post(
  '/message',
  zValidator('json', z.object({
    tenantId: z.string(),
    chatId: z.string(),
    text: z.string().min(1),
  })),
  async (c) => {
    const { tenantId, chatId, text } = c.req.valid('json')
    const client = bridgeManager.get(tenantId)

    if (!client || !client.isConnected()) {
      return c.json({ success: false, error: 'Agent offline' }, 400)
    }

    try {
      await client.sendMessage(chatId, text)
      return c.json({ success: true })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)

// POST /agent/provision  placeholder for full AgentFactory provisioning
agentRoutes.post('/provision', async (c) => {
  // TODO: wire AgentFactory.provision() after PostgreSQL is set up
  return c.json({ success: true, message: 'Provisioning coming in next step' })
})
