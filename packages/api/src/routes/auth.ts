import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { bridgeManager } from '@agentr/core'
import { randomUUID } from 'crypto'

export const authRoutes = new Hono()

// Step 1  phone submitted, send OTP via Telegram MTProto
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

// Step 2  OTP submitted, verify and activate session
authRoutes.post(
  '/verify-otp',
  zValidator('json', z.object({
    tenantId: z.string(),
    phone: z.string(),
    phoneCodeHash: z.string(),
    code: z.string().length(5),
  })),
  async (c) => {
    const { tenantId, phoneCodeHash, code } = c.req.valid('json')

    try {
      const ok = await bridgeManager.verifyOtp(tenantId, phoneCodeHash, code)
      if (!ok) return c.json({ success: false, error: 'Invalid OTP code' }, 400)
      return c.json({ success: true, tenantId, message: 'Agent session active' })
    } catch (err) {
      // 2FA required
      if (String(err).includes('2FA_REQUIRED')) {
        return c.json({ success: false, error: '2FA_REQUIRED', tenantId }, 202)
      }
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)

// Step 2b  2FA password if needed
authRoutes.post(
  '/verify-2fa',
  zValidator('json', z.object({
    tenantId: z.string(),
    password: z.string().min(1),
  })),
  async (c) => {
    const { tenantId, password } = c.req.valid('json')

    try {
      const ok = await bridgeManager.verify2FA(tenantId, password)
      if (!ok) return c.json({ success: false, error: 'Invalid 2FA password' }, 400)
      return c.json({ success: true, tenantId, message: 'Agent session active' })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)
