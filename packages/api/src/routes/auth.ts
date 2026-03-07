import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

export const authRoutes = new Hono()

// Step 1  user submits phone, we send OTP via Telegram
authRoutes.post(
  '/request-otp',
  zValidator('json', z.object({ phone: z.string().min(10) })),
  async (c) => {
    const { phone } = c.req.valid('json')
    // TODO: AgentFactory.requestOtp(phone)
    return c.json({ success: true, message: 'OTP sent', phone })
  }
)

// Step 2  user submits OTP, we verify and create session
authRoutes.post(
  '/verify-otp',
  zValidator('json', z.object({
    phone: z.string(),
    code: z.string().length(5),
    hash: z.string(),
  })),
  async (c) => {
    const { phone, code, hash } = c.req.valid('json')
    // TODO: AgentFactory.verifyOtp(phone, code, hash)
    return c.json({ success: true, message: 'Verified', phone, code, hash })
  }
)
