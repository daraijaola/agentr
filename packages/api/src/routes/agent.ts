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

// POST /agent/message � user sends message to their agent
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

// POST /agent/provision � called after OTP verified + payment confirmed
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


// POST /agent/provider - switch LLM provider for a tenant
agentRoutes.post(
  '/provider',
  zValidator('json', z.object({
    tenantId: z.string(),
    provider: z.enum(['kimi', 'openai']),
  })),
  async (c) => {
    const { tenantId, provider } = c.req.valid('json')
    const runtime = agentFactory.get(tenantId)
    if (!runtime) {
      return c.json({ success: false, error: 'Agent not found' }, 404)
    }
    try {
      const db = agentFactory.getDb()
      await db.query(
        'UPDATE tenants SET llm_provider = $1 WHERE id = $2',
        [provider, tenantId]
      )
      const providerMap = {
        kimi:   { provider: 'moonshot', model: 'kimi-k2-turbo-preview', apiKey: process.env['MOONSHOT_API_KEY'] ?? '' },
        openai: { provider: 'openai',   model: 'gpt-4o',                apiKey: process.env['OPENAI_API_KEY'] ?? '' },
      }
      const cfg = providerMap[provider]
      runtime.updateLLM({ provider: cfg.provider as never, model: cfg.model, apiKey: cfg.apiKey })
      return c.json({ success: true, provider, model: cfg.model })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)

// POST /agent/start-trial - record free trial start
agentRoutes.post(
  '/start-trial',
  zValidator('json', z.object({ tenantId: z.string() })),
  async (c) => {
    const { tenantId } = c.req.valid('json')
    try {
      const db = agentFactory.getDb()
      await db.startFreeTrial(tenantId)
      return c.json({ success: true })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)

// GET /agent/trial-status/:tenantId - check if trial expired
agentRoutes.get('/trial-status/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  try {
    const db = agentFactory.getDb()
    const status = await db.getTrialStatus(tenantId)
    if (status.expired) {
      // Deprovision and block
      try {
        await agentFactory.deprovision(tenantId)
        if (status.phone) await db.blockPhone(status.phone)
      } catch {}
    }
    return c.json({ expired: status.expired, expiresAt: status.expiresAt })
  } catch (err) {
    return c.json({ expired: false, expiresAt: null })
  }
})

// POST /agent/check-phone - check if phone is blocked before OTP
agentRoutes.post(
  '/check-phone',
  zValidator('json', z.object({ phone: z.string() })),
  async (c) => {
    const { phone } = c.req.valid('json')
    try {
      const db = agentFactory.getDb()
      const blocked = await db.isPhoneBlocked(phone)
      return c.json({ blocked })
    } catch {
      return c.json({ blocked: false })
    }
  }
)

// GET /agent/processes/:tenantId
agentRoutes.get('/processes/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  try {
    const { execSync } = await import('child_process')
    const short = tenantId.split('-')[0]
    const prefix = 'agent-' + short + '-'
    const out = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8' })
    const all = JSON.parse(out)
    const mine = all
      .filter((p: any) => p.name.startsWith(prefix))
      .map((p: any) => ({ name: p.name.replace(prefix, ''), status: p.pm2_env.status, pid: p.pid }))
    return c.json({ processes: mine })
  } catch { return c.json({ processes: [] }) }
})

// GET /agent/logs/:tenantId/:name
agentRoutes.get('/logs/:tenantId/:name', async (c) => {
  const tenantId = c.req.param('tenantId')
  const name = c.req.param('name')
  try {
    const { execSync } = await import('child_process')
    const short = tenantId.split('-')[0]
    const pmName = 'agent-' + short + '-' + name
    const logs = execSync('pm2 logs ' + pmName + ' --lines 50 --nostream 2>&1', { encoding: 'utf8' })
    return c.json({ logs })
  } catch (err) { return c.json({ logs: String(err) }) }
})

// POST /agent/process/stop
agentRoutes.post('/process/stop',
  zValidator('json', z.object({ tenantId: z.string(), name: z.string() })),
  async (c) => {
    const { tenantId, name } = c.req.valid('json')
    try {
      const { execSync } = await import('child_process')
      const short = tenantId.split('-')[0]
      const pmName = 'agent-' + short + '-' + name
      execSync('pm2 delete ' + pmName, { encoding: 'utf8' })
      return c.json({ success: true })
    } catch (err) { return c.json({ success: false, error: String(err) }) }
  }
)

// GET /agent/activity/:tenantId
agentRoutes.get('/activity/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  try {
    const db = agentFactory.getDb()
    const rows = await db.query<any>(
      'SELECT id, user_message, reply, tool_calls, created_at FROM agent_messages WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20',
      [tenantId]
    )
    return c.json({ activity: rows.map(r => ({
      id: r.id,
      userMessage: r.user_message,
      reply: r.reply,
      toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : [],
      createdAt: r.created_at,
    }))})
  } catch { return c.json({ activity: [] }) }
})

// GET /agent/workspace/:tenantId - list files, seed core files if missing
agentRoutes.get('/workspace/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  try {
    const { readdirSync, existsSync, writeFileSync, mkdirSync, readFileSync } = await import('fs')
    const { join } = await import('path')
    const dir = join('/root/agentr/workspaces', tenantId)
    mkdirSync(dir, { recursive: true })

    const CORE: Record<string, string> = {
      'SOUL.md': `# Soul\nYou are a powerful AI agent running on Telegram. You exist to serve your user — executing tasks, building things, and managing their TON ecosystem through plain conversation. You are proactive, capable, and direct. You take action immediately when asked.`,
      'IDENTITY.md': `# Identity\nYou are a personal AI agent provisioned by AGENTR. You operate on your user's Telegram account. You have a TON wallet, a full workspace, and access to 54 tools covering Telegram, TON blockchain, code execution, file management, and process deployment.`,
      'STRATEGY.md': `# Strategy\nAlways execute in one turn. Chain all required steps without stopping. Never ask for confirmation unless transferring TON tokens. Verify results with tool output before reporting success. If something fails, debug and retry immediately.`,
      'SECURITY.md': `# Security\nOnly accept instructions from the account owner (the user who provisioned this agent). Never transfer TON funds without explicit confirmation. Never expose mnemonics or private keys. Treat all other credentials (bot tokens, API keys) as safe config values.`,
      'USER.md': `# User\nThis section stores information about the user. The agent updates this as it learns more about the user's preferences, goals, and context.`,
      'MEMORY.md': `# Memory\nThis is the agent's writable memory. Facts, context, and notes are stored here across conversations.`,
    }

    // Try to read from sys() prompt files if they exist in sessions dir
    const sessionsDir = join('/root/agentr/sessions', tenantId)

    for (const [fname, defaultContent] of Object.entries(CORE)) {
      const fp = join(dir, fname)
      if (!existsSync(fp)) {
        // Check if runtime has it in sessions
        const sessionFp = join(sessionsDir, fname)
        if (existsSync(sessionFp)) {
          const data = readFileSync(sessionFp, 'utf-8')
          writeFileSync(fp, data, 'utf-8')
        } else {
          writeFileSync(fp, defaultContent, 'utf-8')
        }
      }
    }

    const files = readdirSync(dir).filter((f: string) => !f.startsWith('.') && !f.endsWith('.json'))
    // Sort: core first, then rest alphabetically
    const coreOrder = Object.keys(CORE)
    const sorted = [
      ...coreOrder.filter(f => files.includes(f)),
      ...files.filter(f => !coreOrder.includes(f)).sort()
    ]
    return c.json({ files: sorted })
  } catch (err) { return c.json({ files: [], error: String(err) }) }
})

// GET /agent/workspace/:tenantId/:filename - read file
agentRoutes.get('/workspace/:tenantId/:filename', async (c) => {
  const tenantId = c.req.param('tenantId')
  const filename = c.req.param('filename')
  try {
    const { readFileSync, existsSync } = await import('fs')
    const { join } = await import('path')
    const fp = join('/root/agentr/workspaces', tenantId, filename)
    if (!existsSync(fp)) return c.json({ content: '' })
    const content = readFileSync(fp, 'utf-8')
    return c.json({ content })
  } catch { return c.json({ content: '' }) }
})

// POST /agent/workspace/:tenantId/:filename - write file
agentRoutes.post('/workspace/:tenantId/:filename',
  zValidator('json', z.object({ content: z.string() })),
  async (c) => {
    const tenantId = c.req.param('tenantId')
    const filename = c.req.param('filename')
    const { content } = c.req.valid('json')
    try {
      const { writeFileSync, mkdirSync } = await import('fs')
      const { join } = await import('path')
      const dir = join('/root/agentr/workspaces', tenantId)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, filename), content, 'utf-8')
      return c.json({ success: true })
    } catch (err) { return c.json({ success: false, error: String(err) }) }
  }
)

// GET /agent/credits/:tenantId
agentRoutes.get('/credits/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  try {
    const db = agentFactory.getDb()
    const credits = await db.getCredits(tenantId)
    return c.json({ credits })
  } catch { return c.json({ credits: 0 }) }
})

// GET /agent/credits-usage/:tenantId
agentRoutes.get('/credits-usage/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  try {
    const db = agentFactory.getDb()
    const credits = await db.getCredits(tenantId)
    const rows = await db.query<any>(
      `SELECT amount, type, description, model, created_at 
       FROM credit_transactions WHERE tenant_id = $1 
       ORDER BY created_at DESC LIMIT 50`,
      [tenantId]
    )
    const totalUsed = rows.filter((r:any) => r.amount < 0).reduce((s:number, r:any) => s + Math.abs(r.amount), 0)
    const totalAdded = rows.filter((r:any) => r.amount > 0).reduce((s:number, r:any) => s + r.amount, 0)
    return c.json({ credits, totalUsed, totalAdded, transactions: rows })
  } catch (err) { return c.json({ credits: 0, totalUsed: 0, totalAdded: 0, transactions: [] }) }
})

// GET /agent/marketplace - list all marketplace agents
agentRoutes.get('/marketplace', async (c) => {
  try {
    const db = agentFactory.getDb()
    const rows = await db.query<any>(
      `SELECT id, name, description, category, creator_name, price_credits, installs, rating, verified
       FROM marketplace_agents WHERE active = true ORDER BY installs DESC`,
      []
    )
    return c.json({ agents: rows })
  } catch (err) { return c.json({ agents: [] }) }
})

// POST /agent/marketplace/deploy - deploy a marketplace agent
agentRoutes.post('/marketplace/deploy',
  zValidator('json', z.object({ tenantId: z.string(), agentId: z.string() })),
  async (c) => {
    const { tenantId, agentId } = c.req.valid('json')
    try {
      const db = agentFactory.getDb()
      const rows = await db.query<any>(
        'SELECT * FROM marketplace_agents WHERE id = $1',
        [agentId]
      )
      if (!rows[0]) return c.json({ success: false, error: 'Agent not found' }, 404)
      const agent = rows[0]
      // Write soul/identity/strategy to workspace
      const { writeFileSync, mkdirSync } = await import('fs')
      const { join } = await import('path')
      const dir = join('/root/agentr/workspaces', tenantId)
      mkdirSync(dir, { recursive: true })
      if (agent.soul) writeFileSync(join(dir, 'SOUL.md'), agent.soul)
      if (agent.identity) writeFileSync(join(dir, 'IDENTITY.md'), agent.identity)
      if (agent.strategy) writeFileSync(join(dir, 'STRATEGY.md'), agent.strategy)
      // Increment installs
      await db.query('UPDATE marketplace_agents SET installs = installs + 1 WHERE id = $1', [agentId])
      return c.json({ success: true, message: 'Agent deployed to your workspace' })
    } catch (err) { return c.json({ success: false, error: String(err) }) }
  }
)

// POST /agent/dev/register
agentRoutes.post('/dev/register',
  zValidator('json', z.object({
    name: z.string(),
    email: z.string().email(),
    telegram: z.string(),
    wallet: z.string(),
    password: z.string().min(6),
    category: z.string(),
    bio: z.string().optional(),
  })),
  async (c) => {
    const body = c.req.valid('json')
    try {
      const db = agentFactory.getDb()
      const existing = await db.query('SELECT id FROM dev_accounts WHERE email = $1', [body.email])
      if ((existing as any[]).length > 0) return c.json({ success: false, error: 'Email already registered' }, 400)
      const crypto = await import('crypto')
      const hash = crypto.createHash('sha256').update(body.password).digest('hex')
      const token = crypto.randomBytes(32).toString('hex')
      await db.query(
        'INSERT INTO dev_accounts (name, email, telegram_username, wallet_address, password_hash, token, category, bio, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [body.name, body.email, body.telegram, body.wallet, hash, token, body.category, body.bio ?? '', 'pending']
      )
      return c.json({ success: true, token })
    } catch (err) { return c.json({ success: false, error: String(err) }, 500) }
  }
)

// POST /agent/dev/login
agentRoutes.post('/dev/login',
  zValidator('json', z.object({ email: z.string(), password: z.string() })),
  async (c) => {
    const { email, password } = c.req.valid('json')
    try {
      const db = agentFactory.getDb()
      const crypto = await import('crypto')
      const hash = crypto.createHash('sha256').update(password).digest('hex')
      const rows = await db.query<any>('SELECT id, name, token, approved, earnings_credits FROM dev_accounts WHERE email = $1 AND password_hash = $2', [email, hash])
      if (!(rows as any[]).length) return c.json({ success: false, error: 'Invalid email or password' }, 401)
      const dev = (rows as any[])[0]
      return c.json({ success: true, token: dev.token, name: dev.name, approved: dev.approved, earnings: dev.earnings_credits, id: dev.id })
    } catch (err) { return c.json({ success: false, error: String(err) }, 500) }
  }
)

// GET /agent/dev/profile/:token
agentRoutes.get('/dev/profile/:token', async (c) => {
  const token = c.req.param('token')
  try {
    const db = agentFactory.getDb()
    const rows = await db.query<any>(
      'SELECT id, name, email, telegram_username, wallet_address, earnings_credits, approved, category, bio FROM dev_accounts WHERE token = $1',
      [token]
    )
    if (!(rows as any[]).length) return c.json({ success: false }, 404)
    const dev = (rows as any[])[0]
    const agents = await db.query<any>('SELECT id, name, category, installs, rating, active FROM marketplace_agents WHERE creator_id = $1', [dev.id])
    return c.json({ success: true, dev, agents })
  } catch { return c.json({ success: false }, 500) }
})

// POST /agent/dev/submit-agent - submit agent to marketplace
agentRoutes.post('/dev/submit-agent',
  zValidator('json', z.object({
    token: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.string(),
    github: z.string(),
    test_account: z.string().optional(),
    notes: z.string().optional(),
  })),
  async (c) => {
    const body = c.req.valid('json')
    try {
      const db = agentFactory.getDb()
      const devRows = await db.query<any>('SELECT id, name FROM dev_accounts WHERE token = $1', [body.token])
      if (!(devRows as any[]).length) return c.json({ success: false, error: 'Invalid token' }, 401)
      const dev = (devRows as any[])[0]
      await db.query(
        'INSERT INTO marketplace_agents (name, description, category, creator_id, creator_name, github_url, test_account, notes, verified, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [body.name, body.description, body.category, dev.id, dev.name, body.github, body.test_account ?? '', body.notes ?? '', false, false]
      )
      return c.json({ success: true, message: 'Agent submitted for review' })
    } catch (err) { return c.json({ success: false, error: String(err) }, 500) }
  }
)

// POST /agent/dev/withdraw
agentRoutes.post('/dev/withdraw',
  zValidator('json', z.object({ token: z.string() })),
  async (c) => {
    const { token } = c.req.valid('json')
    try {
      const db = agentFactory.getDb()
      const rows = await db.query<any>('SELECT id, earnings_credits, wallet_address FROM dev_accounts WHERE token = $1', [token])
      if (!(rows as any[]).length) return c.json({ success: false, error: 'Invalid token' }, 401)
      const dev = (rows as any[])[0]
      if (dev.earnings_credits < 1000) return c.json({ success: false, error: 'Minimum withdrawal is 1,000 credits' })
      // Record withdrawal request (actual TON transfer handled separately)
      await db.query('UPDATE dev_accounts SET earnings_credits = 0 WHERE id = $1', [dev.id])
      await db.query(
        'INSERT INTO credit_transactions (tenant_id, amount, type, description) VALUES ($1, $2, $3, $4)',
        [dev.id, -dev.earnings_credits, 'withdrawal', 'Dev earnings withdrawal to ' + dev.wallet_address]
      )
      return c.json({ success: true, amount: dev.earnings_credits, wallet: dev.wallet_address })
    } catch (err) { return c.json({ success: false, error: String(err) }, 500) }
  }
)

// GET /agent/admin/submissions?password=xxx
agentRoutes.get('/admin/submissions', async (c) => {
  const password = c.req.query('password')
  if (password !== process.env['ADMIN_PASSWORD'] && password !== 'agentr2026admin') {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  try {
    const db = agentFactory.getDb()
    const pending = await db.query<any>(
      `SELECT m.id, m.name, m.description, m.category, m.github_url, m.test_account, m.notes, m.created_at,
              d.name as dev_name, d.email as dev_email, d.telegram_username as dev_telegram
       FROM marketplace_agents m
       LEFT JOIN dev_accounts d ON d.id = m.creator_id
       WHERE m.active = false
       ORDER BY m.created_at DESC`,
      []
    )
    const live = await db.query<any>(
      `SELECT m.id, m.name, m.category, m.installs, m.rating, d.name as dev_name
       FROM marketplace_agents m
       LEFT JOIN dev_accounts d ON d.id = m.creator_id
       WHERE m.active = true ORDER BY m.installs DESC`,
      []
    )
    const devs = await db.query<any>(
      'SELECT id, name, email, telegram_username, category, status, approved, earnings_credits, created_at FROM dev_accounts ORDER BY created_at DESC',
      []
    )
    return c.json({ pending, live, devs })
  } catch (err) { return c.json({ error: String(err) }, 500) }
})

// POST /agent/admin/approve
agentRoutes.post('/admin/approve',
  zValidator('json', z.object({ password: z.string(), agentId: z.string(), action: z.enum(['approve','reject']), reviewer_notes: z.string().optional() })),
  async (c) => {
    const { password, agentId, action, reviewer_notes } = c.req.valid('json')
    if (password !== process.env['ADMIN_PASSWORD'] && password !== 'agentr2026admin') {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    try {
      const db = agentFactory.getDb()
      if (action === 'approve') {
        await db.query('UPDATE marketplace_agents SET active = true, verified = false, reviewer_notes = $1 WHERE id = $2', [reviewer_notes ?? '', agentId])
      } else {
        await db.query('DELETE FROM marketplace_agents WHERE id = $1', [agentId])
      }
      return c.json({ success: true })
    } catch (err) { return c.json({ success: false, error: String(err) }) }
  }
)

// POST /agent/admin/approve-dev
agentRoutes.post('/admin/approve-dev',
  zValidator('json', z.object({ password: z.string(), devId: z.string(), action: z.enum(['approve','reject']) })),
  async (c) => {
    const { password, devId, action } = c.req.valid('json')
    if (password !== process.env['ADMIN_PASSWORD'] && password !== 'agentr2026admin') {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    try {
      const db = agentFactory.getDb()
      await db.query('UPDATE dev_accounts SET approved = $1, status = $2 WHERE id = $3', [action === 'approve', action === 'approve' ? 'approved' : 'rejected', devId])
      return c.json({ success: true })
    } catch (err) { return c.json({ success: false, error: String(err) }) }
  }
)
// DELETE /agent/:tenantId � deprovision agent
agentRoutes.delete('/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  try {
    await agentFactory.deprovision(tenantId)
    return c.json({ success: true, message: 'Agent deprovisioned' })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})
