import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { telethonRequestOtp, telethonVerifyOtp, telethonVerify2FA } from '../telethon-bridge.js'
import { randomUUID } from 'crypto'
import { agentFactory } from '@agentr/factory'
import { signToken, getSecret } from '../middleware/auth.js'

// Determine whether to provision a new agent or resume an existing one
async function provisionOrResume(tenantId: string, phone: string): Promise<void> {
  const rows = await agentFactory.getDb().query<any>(
    `SELECT t.id, t.phone, t.wallet_address, t.wallet_mnemonic_enc, t.plan, t.created_at
     FROM tenants t
     JOIN agent_instances ai ON ai.tenant_id = t.id
     WHERE t.id = $1 LIMIT 1`,
    [tenantId]
  )
  if ((rows as any[]).length > 0) {
    // Tenant already exists — resume the session, don't create a new wallet
    const row = (rows as any[])[0]
    await agentFactory.resumeOne(row)
  } else {
    // Brand-new tenant — full provision
    await agentFactory.provision(tenantId, phone)
  }
}

export const authRoutes = new Hono()

authRoutes.post(
  '/request-otp',
  zValidator('json', z.object({ phone: z.string().min(10) })),
  async (c) => {
    const { phone: rawPhone } = c.req.valid('json')
    const phone = rawPhone.replace(/\s+/g, '')
    // Reuse existing active tenant for same phone
    const existingRows = await agentFactory.getDb().query<any>(
      'SELECT id FROM tenants WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
      [phone]
    )
    const isExisting = (existingRows as any[]).length > 0 && (existingRows as any[])[0].id
    const tenantId = isExisting ? (existingRows as any[])[0].id : randomUUID()
    try {
      // Clear stale session file if it exists - forces fresh auth
      try {
        const { unlinkSync, existsSync } = await import('fs')
        const { join } = await import('path')
        const sf = join(process.env['SESSIONS_PATH'] ?? '/root/agentr/sessions', tenantId + '.session')
        if (existsSync(sf)) { unlinkSync(sf); console.log('[Auth] Cleared stale session for', tenantId) }
      } catch {}
      const { phoneCodeHash } = await telethonRequestOtp(tenantId, phone)
      return c.json({ success: true, tenantId, phoneCodeHash, phone, existing: isExisting })
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
      const ok = await telethonVerifyOtp(tenantId, phone, phoneCodeHash, code)
      if (!ok) return c.json({ success: false, error: 'Invalid OTP code' }, 400)
      await provisionOrResume(tenantId, phone)
      const token = signToken(tenantId, getSecret())
      return c.json({ success: true, tenantId, token, message: 'Agent provisioned and live' })
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
      const ok = await telethonVerify2FA(tenantId, password)
      if (!ok) return c.json({ success: false, error: 'Invalid 2FA password' }, 400)
      await provisionOrResume(tenantId, phone)
      const token = signToken(tenantId, getSecret())
      return c.json({ success: true, tenantId, token, message: 'Agent provisioned and live' })
    } catch (err) {
      console.error('[verify-2fa ERROR]', err)
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)
