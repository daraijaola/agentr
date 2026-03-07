import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { bridgeManager } from '@agentr/core'
import { agentFactory } from '@agentr/factory'

export const agentRoutes = new Hono()

// GET /agent/status/:tenantId
agentRoutes.get('/status/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  const client = bridgeManager.get(tenantId)
  const runtime = agentFactory.get(tenantId)

  if (!client || !runtime) {
    return c.json({ status: 'offline', tenantId })
  }

  const me = client.getMe()
  return c.json({
    status: client.isConnected() ? 'online' : 'offline',
    tenantId,
    tools: runtime.tools.list().length,
    telegram: me ? {
      username: me.username,
      firstName: me.firstName,
      phone: me.phone,
    } : null,
  })
})

// POST /agent/message — user sends message to their agent
agentRoutes.post(
  '/message',
  zValidator('json', z.object({
    tenantId: z.string(),
    message: z.string().min(1),
    chatId: z.string().optional(),
  })),
  async (c) => {
    const { tenantId, message, chatId } = c.req.valid('json')
    const runtime = agentFactory.get(tenantId)

    if (!runtime) {
      return c.json({ success: false, error: 'Agent offline or not provisioned' }, 400)
    }

    try {
      const response = await runtime.processMessage({
        chatId: chatId ?? tenantId,
        userMessage: message,
      })
      return c.json({ success: true, reply: response.content, toolCalls: response.toolCalls })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)

// POST /agent/provision — called after OTP verified + payment confirmed
agentRoutes.post(
  '/provision',
  zValidator('json', z.object({
    tenantId: z.string(),
    phone: z.string(),
  })),
  async (c) => {
    const { tenantId, phone } = c.req.valid('json')

    try {
      await agentFactory.provision(tenantId, phone)
      return c.json({ success: true, tenantId, message: 'Agent provisioned and live' })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)

// DELETE /agent/:tenantId — deprovision agent
agentRoutes.delete('/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  try {
    await agentFactory.deprovision(tenantId)
    return c.json({ success: true, message: 'Agent deprovisioned' })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})
