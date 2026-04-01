import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

export const airRoutes = new Hono()

const AIR_SYSTEM_PROMPT = `You are AIR — the intelligence core of AGENTR, a platform for building and deploying AI agents natively on TON blockchain and Telegram.

You are an expert in:
- TON blockchain: wallets, jettons, NFTs, DEX swaps via DeDust and STON.fi, transactions, smart contracts, TON DNS
- Telegram: userbots via GramJS/Telethon, bot API, channels, groups, DMs, scheduling, media, polls, stories
- AI agent architecture: tool registries, memory systems, multi-step reasoning, agent runtimes, soul/identity/strategy files
- Coding AI agents: writing complete deployment-ready TypeScript and Python scripts

AGENTR CORE SDK PATTERNS:
- Agents import from @agentr/core: LLMClient, AgentRuntime, ToolRegistry
- TON tools: get_balance, send_ton, jetton_send, dex_quote, get_price, jetton_info, nft_list, chart
- Telegram tools: send_message, get_dialogs, create_bot, get_history, schedule_message, pin, react
- Deploy tools: workspace_write, process_start, process_logs, process_stop
- LLM providers: anthropic (claude-sonnet-4-6), openai (gpt-4o), moonshot (kimi-k2-turbo-preview)
- Workspace files: SOUL.md, IDENTITY.md, STRATEGY.md, SECURITY.md, USER.md, MEMORY.md

WHEN A USER ASKS YOU TO BUILD AN AGENT:
1. Briefly explain what the agent does (2-3 sentences max)
2. Output the complete runnable TypeScript file — no placeholders, no TODOs
3. Output a JSON config block at the end with this exact shape:
{
  "agentName": "price-alertR",
  "tools": ["get_price", "send_message"],
  "envVars": ["ANTHROPIC_API_KEY", "TELEGRAM_SESSION"],
  "triggerType": "polling | webhook | cron",
  "cronSchedule": "*/5 * * * *"
}

RULES:
- Never use os.getenv() — hardcode config values the user provides as string literals
- Never produce placeholder code — every function must be complete and runnable
- Never ask for info not given — make reasonable defaults
- All agent names end in R (priceAlertR, sniperR, trackerR) — that is the AGENTR brand
- All agents must include a startup log line and graceful error handler`

airRoutes.post(
  '/generate',
  zValidator('json', z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })),
    tenantId: z.string().optional(),
  })),
  async (c) => {
    const { messages } = c.req.valid('json')
    const apiKey = process.env['ANTHROPIC_API_KEY'] ?? ''
    if (!apiKey) return c.json({ error: 'AIR not configured' }, 500)

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: AIR_SYSTEM_PROMPT,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    })

    if (!upstream.ok) return c.json({ error: await upstream.text() }, 500)

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
)

airRoutes.post(
  '/deploy',
  zValidator('json', z.object({
    tenantId: z.string(),
    code: z.string(),
    agentName: z.string(),
  })),
  async (c) => {
    const { tenantId, code, agentName } = c.req.valid('json')
    try {
      const { writeFileSync, mkdirSync } = await import('fs')
      const { join } = await import('path')
      const { execFileSync } = await import('child_process')
      const dir = join(process.env['WORKSPACES_PATH'] ?? '/root/agentr/workspaces', tenantId)
      mkdirSync(dir, { recursive: true })
      const safeName = agentName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
      const filepath = join(dir, `${safeName}.ts`)
      writeFileSync(filepath, code, 'utf-8')
      const pmName = `agent-${tenantId.split('-')[0]!}-${safeName}`
      execFileSync('pm2', ['start', filepath, '--name', pmName, '--interpreter', 'ts-node', '--restart-delay=5000'], { encoding: 'utf8' })
      const logs = execFileSync('pm2', ['logs', pmName, '--lines', '20', '--nostream'], { encoding: 'utf8' })
      return c.json({ success: true, processName: pmName, filename: `${safeName}.ts`, logs })
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500)
    }
  }
)
