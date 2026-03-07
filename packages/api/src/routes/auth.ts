import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { bridgeManager } from '@agentr/core'
import { randomUUID } from 'crypto'
import { agentFactory } from '@agentr/factory'

export const authRoutes = new Hono()

authRoutes.post(
  '/request-otp',
  zValidator('json', z.object({ phone: z.string().min(10) })),
  async (c) => {
    const { phone } = c.req.valid('json')
    const tenantId = randomUUID()
    try {
      const { phoneCodeHash } = await bridgeManager.requestOtp(tenantId, phone)
      return c.json({ success: true, tenantId, phoneCodeHash, phone })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)

authRoutes.post(
  '/verify-otp',
  zValidator('json', z.object({
    tenantId: z.string(),
    phone: z.string(),
    phoneCodeHash: z.string(),
    code: z.string().length(5),
  })),
  async (c) => {
    const { tenantId, phone, phoneCodeHash, code } = c.req.valid('json')
    try {
      const ok = await bridgeManager.verifyOtp(tenantId, phoneCodeHash, code)
      if (!ok) return c.json({ success: false, error: 'Invalid OTP code' }, 400)
      await agentFactory.provision(tenantId, phone)
      return c.json({ success: true, tenantId, message: 'Agent provisioned and live', mock_payment: true })
    } catch (err) {
      if (String(err).includes('2FA_REQUIRED')) {
        return c.json({ success: false, error: '2FA_REQUIRED', tenantId }, 202)
      }
      console.error('[verify-otp ERROR]', err)
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)

authRoutes.post(
  '/verify-2fa',
  zValidator('json', z.object({
    tenantId: z.string(),
    phone: z.string(),
    password: z.string().min(1),
  })),
  async (c) => {
    const { tenantId, phone, password } = c.req.valid('json')
    try {
      const ok = await bridgeManager.verify2FA(tenantId, password)
      if (!ok) return c.json({ success: false, error: 'Invalid 2FA password' }, 400)
      await agentFactory.provision(tenantId, phone)
      return c.json({ success: true, tenantId, message: 'Agent provisioned and live', mock_payment: true })
    } catch (err) {
      console.error('[verify-2fa ERROR]', err)
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)
