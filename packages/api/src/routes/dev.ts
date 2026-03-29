import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { AgentRuntime, buildDevSystemPrompt, getWorkspaceRoot, registerDevTools } from '@agentr/core'
import { agentFactory } from '@agentr/factory'
import path from 'path'
import fs from 'fs/promises'

export const devRoutes = new Hono()

// In-memory developer sessions (separate from Telegram agent sessions)
interface DevSession { runtime: AgentRuntime; model: string; createdAt: number }
const devSessions = new Map<string, DevSession>()
const DEV_SESSION_TTL_MS = 4 * 60 * 60 * 1000

function buildLLMConfig(model: string, byokKey?: string, byokProvider?: string): import('@agentr/core').LLMConfig {
  const airKey = process.env['OPENAI_API_KEY'] ?? ''
  const modelMap: Record<string, string> = {
    'claude':        'claude-opus-4-5',
    'claude-sonnet': 'claude-sonnet-4-5',
    'codex':         'o4-mini',
    'gpt4':          'gpt-4o',
    'air':           'claude-sonnet-4-5',
  }
  if (byokKey && byokProvider === 'anthropic') {
    return { provider: 'air', apiKey: byokKey, model: 'claude-sonnet-4-5' }
  }
  if (byokKey && byokProvider === 'openai') {
    return { provider: 'air', apiKey: byokKey, model: 'gpt-4o' }
  }
  return { provider: 'air', apiKey: airKey, model: modelMap[model] ?? 'claude-sonnet-4-5' }
}

async function getOrCreateDevSession(tenantId: string, model: string, walletAddress: string, byokKey?: string, byokProvider?: string): Promise<AgentRuntime> {
  const keyFingerprint = byokKey ? byokKey.slice(-6) : ''
  const key = `${tenantId}:${model}:${byokProvider || 'air'}:${keyFingerprint}`
  const existing = devSessions.get(key)
  if (existing && Date.now() - existing.createdAt < DEV_SESSION_TTL_MS) return existing.runtime

  const llmCfg = buildLLMConfig(model, byokKey, byokProvider)
  const runtime = new AgentRuntime(
    { tenantId, userId: tenantId, telegramPhone: '', walletAddress, agentName: 'DevAgent', llmProvider: 'air' },
    llmCfg,
    { maxConcurrentLoops: 3 }
  )

  await registerDevTools(runtime.tools, { tenantId, walletAddress })

  runtime.systemPromptOverride = () =>
    buildDevSystemPrompt(tenantId, walletAddress, model, runtime.tools.list().length)

  devSessions.set(key, { runtime, model, createdAt: Date.now() })

  // Evict expired sessions
  for (const [k, v] of devSessions) {
    if (Date.now() - v.createdAt > DEV_SESSION_TTL_MS) devSessions.delete(k)
  }

  return runtime
}

function getTenantId(c: any): string | undefined {
  return c.get('tenantId') as string | undefined
}

// POST /dev/chat
devRoutes.post('/chat', zValidator('json', z.object({
  tenantId: z.string().min(1),
  message: z.string().min(1).max(20000),
  model: z.enum(['claude', 'claude-sonnet', 'codex', 'air', 'gpt4']).default('air'),
  apiKey: z.string().optional(),
  provider: z.enum(['anthropic', 'openai', '']).optional(),
})), async (c) => {
  const authTenantId = getTenantId(c)
  const { tenantId, message, model, apiKey, provider } = c.req.valid('json')
  if (authTenantId && authTenantId !== tenantId) return c.json({ error: 'Unauthorized' }, 403)

  try {
    const db = agentFactory.getDb()
    const rows = await db.query<{ wallet_address: string }>(
      `SELECT wallet_address FROM tenants WHERE tenant_id = $1`, [tenantId]
    )
    const walletAddress = rows[0]?.wallet_address ?? ''
    const runtime = await getOrCreateDevSession(tenantId, model, walletAddress, apiKey, provider)
    const response = await runtime.processMessage({ chatId: `dev:${tenantId}`, userMessage: message, userName: 'Coder' })
    return c.json({ success: true, response: response.content, toolCalls: response.toolCalls ?? [], model })
  } catch (err) {
    console.error('[Dev] Chat error:', err)
    return c.json({ error: 'Agent error: ' + String(err) }, 500)
  }
})

// DELETE /dev/session
devRoutes.delete('/session', zValidator('json', z.object({
  tenantId: z.string(),
  model: z.string().optional(),
})), async (c) => {
  const authTenantId = getTenantId(c)
  const { tenantId, model } = c.req.valid('json')
  if (authTenantId && authTenantId !== tenantId) return c.json({ error: 'Unauthorized' }, 403)

  if (model) {
    const prefix = `${tenantId}:${model}:`
    for (const [k, v] of devSessions) {
      if (k.startsWith(prefix)) { v.runtime.clearHistory(`dev:${tenantId}`); devSessions.delete(k) }
    }
  } else {
    for (const [k, v] of devSessions) {
      if (k.startsWith(tenantId + ':')) { v.runtime.clearHistory(`dev:${tenantId}`); devSessions.delete(k) }
    }
  }
  return c.json({ success: true, message: 'Session cleared' })
})

// GET /dev/files/:tenantId
devRoutes.get('/files/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  const authTenantId = getTenantId(c)
  if (authTenantId && authTenantId !== tenantId) return c.json({ error: 'Unauthorized' }, 403)

  const workspaceRoot = getWorkspaceRoot(tenantId)

  async function walk(dir: string, prefix = ''): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number; mtime?: number }>> {
    const items: Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number; mtime?: number }> = []
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'build') continue
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          items.push({ name: entry.name, path: relPath, type: 'dir' })
          items.push(...await walk(path.join(dir, entry.name), relPath))
        } else {
          const stat = await fs.stat(path.join(dir, entry.name)).catch(() => null)
          items.push({ name: entry.name, path: relPath, type: 'file', size: stat?.size, mtime: stat ? Math.floor(stat.mtimeMs / 1000) : undefined })
        }
      }
    } catch {}
    return items
  }

  return c.json({ success: true, files: await walk(workspaceRoot), workspaceRoot })
})

// GET /dev/file/:tenantId
devRoutes.get('/file/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  const filePath = c.req.query('path') ?? ''
  const authTenantId = getTenantId(c)
  if (authTenantId && authTenantId !== tenantId) return c.json({ error: 'Unauthorized' }, 403)

  const workspaceRoot = getWorkspaceRoot(tenantId)
  const absPath = path.resolve(workspaceRoot, filePath)
  if (!absPath.startsWith(workspaceRoot)) return c.json({ error: 'Path traversal denied' }, 400)

  try {
    const content = await fs.readFile(absPath, 'utf8')
    return c.json({ success: true, content, path: filePath })
  } catch {
    return c.json({ error: 'File not found: ' + filePath }, 404)
  }
})
