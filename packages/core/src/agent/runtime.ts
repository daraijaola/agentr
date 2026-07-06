import { LLMClient } from '../llm/client.js'
import type { LLMConfig, ChatMessage } from '../llm/client.js'
import { ToolRegistry } from './tool-registry.js'
import type { AgentConfig } from '../types/index.js'
import { loadWorkspace } from '../soul/loader.js'
import { maskOldToolResults } from './observation-masking.js'
import { buildSystemPrompt } from './prompts/system.js'
import { sessionManager } from '../session/manager.js'
import { routedExecute } from '../tools/telegram/router.js'

// ─── Credit cost per 1 000 tokens by BTL Runtime model ──────────────────────
// Rates are split by input/output so cheap short replies do not burn a whole
// credit. Fractional usage is accumulated per tenant and deducted once it
// reaches a full credit.
const MODEL_CREDITS_PER_1K: Record<string, { input: number; output: number }> = {
  'btl-2':               { input: 0.05, output: 0.25 },
  'deepseek-v4-flash':   { input: 0.08, output: 0.18 },
  'deepseek-v4-pro':     { input: 0.48, output: 0.96 },
  'deepseek-r1-0528':    { input: 0.55, output: 2.60 },
}
const creditRemainders = new Map<string, number>()
function calcCreditUsage(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_CREDITS_PER_1K[model] ?? MODEL_CREDITS_PER_1K['btl-2']!
  return (inputTokens * rate.input + outputTokens * rate.output) / 1000
}
function wholeCreditsForTenant(tenantId: string, rawCost: number): number {
  const total = (creditRemainders.get(tenantId) ?? 0) + rawCost
  const whole = Math.floor(total)
  creditRemainders.set(tenantId, total - whole)
  return whole
}

// ─── Enterprise phones — always bypass credit checks ─────────────────────────
const ENTERPRISE_PHONES_RT = new Set(process.env["ENTERPRISE_PHONE"] ? [process.env["ENTERPRISE_PHONE"]] : [])

// ─── Heavy tools disabled in Limited Mode ────────────────────────────────────
const LIMITED_MODE_BLOCKED_TOOLS = new Set([
  'create_telegram_bot', 'serve_static', 'workspace_write', 'workspace_read',
  'workspace_list', 'workspace_delete', 'code_execute', 'process_start',
  'process_stop', 'process_restart', 'process_logs', 'process_list',
  'swarm_execute', 'ton_deploy_testnet', 'ton_deploy_jetton', 'ton_compile',
  'ton_create_nft', 'send_ton', 'jetton_send', 'nft_transfer',
  'telegram_bot_api', 'delete_site', 'dns_start_auction', 'dns_link',
])

// ─── In-memory daily message counter for Limited Mode (resets at midnight) ───
const _dailyCounters = new Map<string, { date: string; count: number }>()
function _todayStr(): string { return new Date().toISOString().split('T')[0]! }
function getDailyCount(tenantId: string): number {
  const e = _dailyCounters.get(tenantId)
  return (e && e.date === _todayStr()) ? e.count : 0
}
function incDailyCount(tenantId: string): void {
  const today = _todayStr()
  const e = _dailyCounters.get(tenantId)
  if (!e || e.date !== today) _dailyCounters.set(tenantId, { date: today, count: 1 })
  else e.count++
}
// ─────────────────────────────────────────────────────────────────────────────

// Simple TTL cache for tool-free responses (cuts API credits on repeated queries)
interface CacheEntry { response: string; expiry: number }
const responseCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCached(key: string): string | null {
  const entry = responseCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) { responseCache.delete(key); return null }
  return entry.response
}
function setCache(key: string, response: string): void {
  if (isBadUserFacingReply(response)) return
  // Evict old entries if cache gets large
  if (responseCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of responseCache) { if (now > v.expiry) responseCache.delete(k) }
  }
  responseCache.set(key, { response, expiry: Date.now() + CACHE_TTL_MS })
}

function isBadUserFacingReply(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/^Binary file\s+-\s+use encoding=/i.test(t)) return true
  if (/^<!DOCTYPE|^<html|^<head|^<body|^<style|^<script/i.test(t)) return true
  if (/^(?:margin|padding|display|position|height|width|color|background|font(?:-family|-size)?|align-items|justify-content|flex-direction)\s*:\s*[^;]+;?$/i.test(t)) return true
  if (/^(?:body|html|\.?[a-z0-9_-]+|#[a-z0-9_-]+)\s*\{/i.test(t)) return true
  if (/Run this app to see the results here|replit\.com|reload_timeout|<svg|<\/html>/i.test(t)) return true
  return false
}

function sanitizeForUpstream(messages: any[]): any[] {
  const result: any[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === 'tool') {
      const prev = result[result.length - 1]
      const hasToolUse = prev?.role === 'assistant' && (
        Array.isArray(prev.content)
          ? prev.content.some((b: any) => b.type === 'tool_use' && b.id === msg.tool_call_id)
          : prev.tool_calls?.some((tc: any) => tc.id === msg.tool_call_id)
      )
      if (!hasToolUse) continue
    }
    // Remove assistant messages with empty or whitespace-only text content
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const cleaned = msg.content.map((b: any) => {
        if (b.type === 'text' && (!b.text || !b.text.trim())) return null
        return b
      }).filter(Boolean)
      if (cleaned.length === 0) continue
      result.push({ ...msg, content: cleaned })
      continue
    }
    result.push(msg)
  }
  return result
}

const MAX_ITER = Math.min(Math.max(1, parseInt(process.env['AGENT_MAX_ITER'] ?? '12', 10)), 20)
const MAX_SIZE = 6000

export interface ProcessMessageOptions { chatId: string; userMessage: string; userName?: string; isGroup?: boolean; messageId?: number }
export interface AgentResponse { content: string; toolCalls?: Array<{ name: string; input: Record<string, unknown> }> }

function stripReasoning(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map(m => { const { reasoning_content, ...rest } = m as unknown as Record<string, unknown>; void reasoning_content; return rest as unknown as ChatMessage })
}

function runtimeInstruction(content: string): ChatMessage {
  return { role: 'user', content: `AGENTR runtime instruction: ${content}` }
}

/**
 * Strip any code/HTML that slipped into the final user-facing response.
 * Non-technical users must never see raw source code in chat.
 */
function sanitizeFinalResponse(text: string, toolsUsed: string[]): string {
  let t = text.trim()

  if (isBadUserFacingReply(t)) {
    if (/^Binary file\s+-\s+use encoding=/i.test(t)) {
      return 'I opened a media/binary file instead of a text file. I skipped that raw file output.'
    }
    return 'I hit an LLM connection error and did not get a valid response. Try again now.'
  }

  // Remove fenced code blocks entirely
  t = t.replace(/```[\s\S]*?```/g, '').trim()

  // Strip unparsed <function_calls> XML blocks (native tool format that leaked through)
  t = t.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim()
  t = t.replace(/<invoke[\s\S]*?<\/invoke>/g, '').trim()
  // Handle all XML tool call formats (with or without attributes)
  t = t.replace(/<tool_calls?[^>]*>[\s\S]*?<\/tool_calls?>/gi, '').trim()
  t = t.replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/gi, '').trim()
  t = t.replace(/<tool_use[^>]*>[\s\S]*?<\/tool_use>/gi, '').trim()

  // Strip Python-style leaked tool calls: ton_send({...}) or functionName({...})
  t = t.replace(/\b[a-z][a-z0-9_]*\s*\(\s*\{[\s\S]*?\}\s*\)\s*/g, '').trim()

  // Strip raw JSON blobs (tool result echoes) — leading or standalone
  // e.g. {"success":true,"data":{...}} that the LLM copied from tool output
  t = t.replace(/^\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*\n*/gm, (match) => {
    try { JSON.parse(match.trim()); return '' } catch { return match }
  }).trim()

  // Strip internal/leaked tool markers
  t = t.replace(/^\[Tool:[^\]]+\][^\n]*\n?/gm, '').trim()
  t = t.replace(/\[called:[^\]]+\]/g, '').trim()
  t = t.replace(/\[calling:[^\]]+\]/gi, '').trim()

  // If response still looks like raw HTML/CSS (starts with tag or has many angle brackets)
  const htmlTagDensity = (t.match(/</g) ?? []).length
  const looksLikeHtml = /^<!DOCTYPE|^<html|^<head|^<body|^<style|^<script/i.test(t)
    || (htmlTagDensity > 8 && t.length > 300)

  // If response looks like CSS — catches @import, property:value blocks, selectors
  const looksLikeCss = (
    /^@import\s+url/i.test(t)
    || /^[a-z\s*#.[\],:>~+]{1,80}\s*\{[\s\S]{20,}/m.test(t)
    || ((t.match(/\{[\s\S]*?\}/g) ?? []).length > 4 && /:\s*[^{;]+;/.test(t))
  ) && t.length > 200

  if (looksLikeHtml || looksLikeCss) {
    // Try to salvage any plain sentence before the code
    const firstLine = t.split('\n').find(l => l.trim().length > 5 && !l.includes('<') && !l.includes('{'))
    const didWebTask = toolsUsed.some(n => n === 'serve_static' || n === 'workspace_write')
    if (firstLine && firstLine.length < 300 && !firstLine.includes('<')) {
      return firstLine.trim()
    }
    return didWebTask
      ? 'Done! Your page has been saved.'
      : 'Done! The task has been completed.'
  }

  // Hard length cap — Telegram shows 4096 chars but walls of text confuse non-devs
  if (t.length > 1200) {
    // Keep first meaningful paragraph
    const para = t.split(/\n\n+/)[0]
    if (para && para.length < 600) return para.trim()
    return t.slice(0, 500).trim() + '...'
  }

  return t
}

function looksLikeFinalReport(text: string): boolean {
  const t = text.trim()
  if (t.length < 30) return false
  // A final report typically has sentence-ending punctuation, lists, or markdown
  const hasPunctuation = /[.!?]\s*$/.test(t)
  const hasList = /^[-*\d]\s+/m.test(t)
  const hasMarkdown = /#{1,3}\s+\w/.test(t) || /```/.test(t)
  const isLong = t.length > 200
  return hasPunctuation || hasList || hasMarkdown || isLong
}

function looksLikeToolNarrationWithoutResult(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /\[(?:calling|called)\s+(?:tool\s*:?\s*)?[a-z][a-z0-9_]*[^\]]*\]/i.test(text) ||
    t.includes('tool result') ||
    t.includes('tool output') ||
    t.includes('tool call') ||
    t.includes('tool fires') ||
    t.includes('tool execution') ||
    t.includes('awaiting tool') ||
    t.includes('balance figure comes straight') ||
    t.includes('i attempted to call') ||
    t.includes("i don't see the actual tool") ||
    t.includes("i don't have access to a tool") ||
    t.includes("i don't have a live market-data tool") ||
    t.includes('if the listing didn') ||
    t.includes('want me to retry')
  )
}

function userExplicitlyAskedForToolAction(text: string): boolean {
  return /\b(use your tool|call (?:the )?tool|check|list|show|fetch|get|create|send|deploy|run|start|stop|restart|balance|price|workspace|files|wallet|ton)\b/i.test(text)
}

function directToolCallForUserMessage(text: string): { name: string; input: Record<string, unknown> } | null {
  const t = text.toLowerCase()
  if (/\b(wallet\s+address|ton\s+address|my\s+address|deposit\s+address)\b/.test(t)) {
    return { name: 'ton_get_address', input: {} }
  }
  if (/\b(balance|wallet balance|ton balance)\b/.test(t)) {
    return { name: 'ton_balance', input: {} }
  }
  if (/\b(price|ton price|current ton|ton\/usd)\b/.test(t)) {
    return { name: 'ton_price', input: {} }
  }
  if (/\b(list|show|check|get)\b/.test(t) && /\b(files|workspace|directory|folders)\b/.test(t)) {
    return { name: 'workspace_list', input: {} }
  }
  return null
}

function summarizeToolResult(name: string, result: { success: boolean; data?: unknown; error?: string }): string {
  if (!result.success) {
    const error = String(result.error ?? 'unknown error')
    if (/^Binary file\s+-\s+use encoding=/i.test(error)) {
      return 'I opened a media/binary file instead of a text file. I skipped that raw file output.'
    }
    return `Tool failed: ${error}`
  }
  const data = (result.data ?? {}) as Record<string, unknown>
  if (name === 'ton_balance') {
    const balance = data['balance'] ?? data['summary'] ?? 'unknown'
    const address = data['address'] ? `\n${String(data['address'])}` : ''
    return `Wallet balance: ${balance} TON${address}`
  }
  if (name === 'ton_price') {
    const price = data['price']
    const currency = data['currency'] ?? 'USD'
    return typeof price === 'number'
      ? `Current TON price: $${price.toFixed(4)} ${currency}`
      : String(data['message'] ?? 'TON price fetched.')
  }
  if (name === 'workspace_list') {
    const files = Array.isArray(data['files']) ? data['files'] as Array<Record<string, unknown>> : []
    if (files.length === 0) return String(data['message'] ?? 'Your workspace is empty.')
    const names = files.slice(0, 12).map(f => String(f['path'] ?? f['name'] ?? '')).filter(Boolean).join(', ')
    const more = files.length > 12 ? `, +${files.length - 12} more` : ''
    return `Workspace files (${files.length}): ${names}${more}`
  }
  return typeof data['message'] === 'string' ? data['message'] as string : 'Done! Task complete.'
}

export class AgentRuntime {
  private llm: LLMClient
  readonly tools: ToolRegistry
  private conversations = new Map<string, ChatMessage[]>()
  private deductCredits?: (tenantId: string, amount: number, description: string, model?: string) => Promise<void>
  private _getDailyCount?: (tenantId: string) => Promise<number>
  private _incDailyCount?: (tenantId: string) => Promise<void>
  private getCredits?: (tenantId: string) => Promise<number>
  private saveConversation?: (tenantId: string, chatId: string, messages: unknown[]) => Promise<void>
  private activeInboundChatId?: string
  private activeLoops = 0
  private readonly maxConcurrentLoops: number
  /** Optional override — when set, replaces the default system prompt builder */
  public systemPromptOverride?: () => Promise<string> | string

  constructor(
    private config: AgentConfig,
    llmConfig: LLMConfig,
    opts?: {
      deductCredits?: (tenantId: string, amount: number, description: string, model?: string) => Promise<void>
      getCredits?: (tenantId: string) => Promise<number>
      saveConversation?: (tenantId: string, chatId: string, messages: unknown[]) => Promise<void>
      getDailyCount?: (tenantId: string) => Promise<number>
      incDailyCount?: (tenantId: string) => Promise<void>
      maxConcurrentLoops?: number
    }
  ) {
    this.llm = new LLMClient(llmConfig)
    this.tools = new ToolRegistry()
    // Wire session stability: rate limit + jitter + health scoring per tool call
    const _tenantId = config.tenantId
    this.tools.setExecuteHook(async (name, execute, params) => {
      if (
        name === 'telegram_send_message' &&
        this.activeInboundChatId &&
        String(params['chatId'] ?? '') === this.activeInboundChatId
      ) {
        return {
          success: false,
          error: 'Do not use telegram_send_message to reply to the current chat. Put the reply in your final assistant response instead.',
        }
      }
      return routedExecute(name, _tenantId, execute)
    })
    this.deductCredits = opts?.deductCredits
    this.getCredits = opts?.getCredits
    this.saveConversation = opts?.saveConversation
    this._getDailyCount = opts?.getDailyCount
    this._incDailyCount = opts?.incDailyCount
    this.maxConcurrentLoops = opts?.maxConcurrentLoops ?? 1
  }

  /** Restore a prior conversation from persistent storage (called by factory on resume) */
  loadHistory(chatId: string, messages: unknown[]): void {
    this.conversations.set(chatId, messages as ChatMessage[])
  }

  private hist(chatId: string): ChatMessage[] {
    if (!this.conversations.has(chatId)) this.conversations.set(chatId, [])
    return this.conversations.get(chatId)!
  }

  private trunc(s: string): string {
    return s.length <= MAX_SIZE ? s : s.slice(0, MAX_SIZE) + '\n...[truncated]'
  }

  private async sys(): Promise<string> {
    if (this.systemPromptOverride) return this.systemPromptOverride()

    let workspace = ''
    try {
      const raw = await loadWorkspace(this.config.tenantId)
      workspace = raw.length > 6000 ? raw.slice(0, 6000) + '\n...[workspace truncated]' : raw
    } catch { /* not ready */ }

    return buildSystemPrompt(
      this.config.telegramPhone,
      this.config.walletAddress,
      process.env['SERVER_PUBLIC_IP'] ?? 'localhost',
      workspace || undefined,
      this.tools.list().length,
      this.config.agentName,
      this.llm.config?.model,
    )
  }

  get isBusy(): boolean { return this.activeLoops >= this.maxConcurrentLoops }

  async processMessage(opts: ProcessMessageOptions): Promise<AgentResponse> {
    if (this.activeLoops >= this.maxConcurrentLoops) {
      return { content: '⏳ I\'m still working on your previous request. Please wait a moment and try again.' }
    }
    this.activeLoops++
    try {
      return await this._processMessage(opts)
    } finally {
      this.activeLoops--
    }
  }

  private async _processMessage(opts: ProcessMessageOptions): Promise<AgentResponse> {
    // ─── Credit gate ──────────────────────────────────────────────────────────
    const isEnterprise = ENTERPRISE_PHONES_RT.has(this.config.telegramPhone ?? '')
      || this.config.plan === 'enterprise'
    let limitedMode = false

    if (!isEnterprise && this.config.tenantId && this.getCredits) {
      const currentCredits = await this.getCredits(this.config.tenantId)
      if (currentCredits <= 0) {
        const dayCount = this._getDailyCount
          ? await this._getDailyCount(this.config.tenantId)
          : getDailyCount(this.config.tenantId)
        if (dayCount >= 8) {
          return {
            content: "You've hit your daily limit of 8 free messages. Your agent stays online — top up with TON to get full access instantly! Even 1,000 credits ($1) unlocks everything.",
          }
        }
        limitedMode = true
        if (this._incDailyCount) {
          await this._incDailyCount(this.config.tenantId)
        } else {
          incDailyCount(this.config.tenantId)
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────────
    const { chatId, userMessage, userName } = opts
    this.activeInboundChatId = chatId
    const envelope = userName ? `[${userName}] ${userMessage}` : userMessage
    const histMessages = stripReasoning(this.hist(chatId))
    const trimmedHist = histMessages.length > 30 ? histMessages.slice(-30) : histMessages
    let messages: ChatMessage[] = [...trimmedHist, { role: 'user', content: envelope }]
    // In Limited Mode: block heavy tools + force cheapest model
    const _originalModel = this.llm.config?.model
    if (limitedMode) {
      if (this.llm.config) this.llm.config.model = 'btl-2'
    }
    const _allTools = this.tools.list()
    const _filteredTools = limitedMode
      ? _allTools.filter(t => !LIMITED_MODE_BLOCKED_TOOLS.has(t.name))
      : _allTools
    const tools = _filteredTools.map(t => ({
      name: t.name,
      description: t.description.slice(0, 300),
      inputSchema: t.parameters
    }))
    let iters = 0, finalResponse = ''
    const allTC: Array<{ name: string; input: Record<string, unknown> }> = []
    const toolUrls: string[] = []  // URLs returned by serve_static, dns_link, etc.
    let lastToolSummary = ''
    let directToolSynthesized = false
    const systemPrompt = await this.sys()
    let toolsRanThisTurn = false
    let consecutiveMalformedCount = 0   // empty/unparseable <tool_call> blocks in a row
    const truncationRetries = new Map<string, number>()  // tool name → truncation count

    // Cache check — only for short messages with no prior tool context in history
    const hasPriorTools = trimmedHist.some(m => m.role === 'tool')
    if (!hasPriorTools && userMessage.length < 200) {
      const cacheKey = `${chatId}:${userMessage.toLowerCase().trim()}`
      const cached = getCached(cacheKey)
      if (cached) {
        console.log('[Runtime:' + this.config.tenantId + '] Cache hit for: ' + cacheKey.slice(0, 60))
        return { content: cached }
      }
    }

    try {
      while (iters < MAX_ITER) {
        iters++

        // Masking handles context size - no arbitrary trimming needed
        
        // Mask old tool results to save context window
        const maskedMessages = maskOldToolResults(messages as any) as typeof messages
        console.log('[Runtime:' + this.config.tenantId + '] LLM call iter ' + iters)
        const res = await this.llm.chat({ systemPrompt, messages: maskedMessages, tools: tools.length > 0 ? tools : undefined })
        if (!res) {
          finalResponse = 'I was unable to complete this request. Please try again.'
          break
        }
        console.log('[Runtime:' + this.config.tenantId + '] LLM done iter ' + iters + ' text:' + res.text.slice(0, 50))
        if (res.toolCalls.length === 0 && res.text.trim().length > 0 && res.messages.length === 0) {
          finalResponse = res.text
          break
        }
        if (res.toolCalls.length === 0 && !toolsRanThisTurn) {
          const directTool = directToolCallForUserMessage(userMessage)
          if (directTool && this.tools.has(directTool.name)) {
            console.log('[Runtime:' + this.config.tenantId + '] Synthesized tool call: ' + directTool.name)
            directToolSynthesized = true
            res.toolCalls.push({
              id: 'tc_direct_' + Math.random().toString(36).slice(2),
              name: directTool.name,
              input: directTool.input,
            })
          }
        }
        // res.messages = [...full input history, newAssistantMsg]
        // Only append the NEW assistant message — do NOT re-append the input history or
        // the conversation doubles in size every iteration (exponential context explosion).
        const allNext = stripReasoning(res.messages)
        const newAssistantMsg = allNext[allNext.length - 1]
        if (newAssistantMsg) messages = [...messages, newAssistantMsg]

        // Deduct credits per LLM call — token-based
        if (this.config.tenantId && this.deductCredits) {
          try {
            const creditCost = res.usage
              ? wholeCreditsForTenant(
                  this.config.tenantId,
                  calcCreditUsage(res.usage.model, res.usage.inputTokens, res.usage.outputTokens)
                )
              : 1
            if (creditCost > 0) {
              await this.deductCredits(this.config.tenantId, creditCost, 'LLM call', res.usage?.model ?? 'air')
            }
          } catch { /* non-blocking */ }
        }

        if (res.toolCalls.length === 0) {
          if (res.text.trim().length > 0) {
            // LLM generated raw XML tool call format instead of using the API tool call format
            if (/<tool_calls?[\s>]/i.test(res.text) || /<tool_call[\s>]/i.test(res.text) || /<tool_use[\s>]/i.test(res.text)) {
              consecutiveMalformedCount++
              let nudge: string
              if (consecutiveMalformedCount >= 3) {
                // Persistent loop — force a completely different strategy
                nudge = 'SYSTEM: Your tool calls keep failing because the file content is too large to fit in a single response. CHANGE STRATEGY: (1) Call workspace_write with a minimal skeleton version of the file — plain HTML under 2000 characters, no inline styles, no long scripts. (2) Then call serve_static. (3) You can improve the design in a follow-up. Do NOT attempt to write the full design in one shot — it will always fail. Start with the skeleton NOW.'
              } else if (consecutiveMalformedCount >= 2) {
                nudge = 'SYSTEM: Your tool call JSON is incomplete — the content is too long and gets cut off. Write a MUCH shorter version of the file (under 3000 characters total). Strip all inline CSS, long scripts, and decorative content. A working minimal page first, then we can improve it.'
              } else {
                nudge = 'SYSTEM: Your tool call was not recognized — the JSON arguments were missing or incomplete. Make sure the args are valid complete JSON. If writing a file, keep the content under 4000 characters. Call the required tool now.'
              }
              messages = stripReasoning([...messages, { role: 'user', content: nudge }])
              continue
            }
            consecutiveMalformedCount = 0  // reset on clean text response
            if (looksLikeToolNarrationWithoutResult(res.text) && iters < MAX_ITER) {
              messages = stripReasoning([
                ...messages,
                runtimeInstruction('Your last response narrated or apologized about a tool instead of executing it. That is invalid. Do not answer in prose. Call the exact required tool now using <tool_use> format. Common exact names: workspace_list for files, ton_price for TON price, ton_balance for wallet balance, ton_get_address for wallet address. If no arguments are needed, use {}.')
              ])
              continue
            }
            if (!toolsRanThisTurn && userExplicitlyAskedForToolAction(userMessage) && !looksLikeFinalReport(res.text) && iters < MAX_ITER) {
              messages = stripReasoning([
                ...messages,
                runtimeInstruction('The user explicitly asked for an action/tool result, but you replied without a tool call. Do not greet or ask what to do. Execute now using <tool_use>. Exact mapping: workspace/files/list -> workspace_list, TON price -> ton_price, wallet balance -> ton_balance.')
              ])
              continue
            }
            // If first iteration and no tools run yet and response is short,
            // the LLM is just acknowledging ("On it!", "Sure!", "Give me a moment...")
            // — nudge it to start executing immediately instead of treating it as done
            if (iters === 1 && !toolsRanThisTurn && res.text.trim().length < 50 && userExplicitlyAskedForToolAction(userMessage)) {
              messages = stripReasoning([
                ...messages,
                {
                  role: 'user',
                  content: 'SYSTEM: If the user gave you a specific task or action to perform, use your tools to execute it now. If the user was chatting casually, your previous reply is already correct — finalize it as-is, do not mention tasks or tools.'
                }
              ])
              continue
            }
            if (toolsRanThisTurn && !looksLikeFinalReport(res.text) && res.text.trim().length < 50) {
              messages = stripReasoning([
                ...messages,
                {
                  role: 'user',
                  content: 'SYSTEM: Task not complete. You have not finished all required steps. Continue executing tool calls immediately — do not summarise, do not stop.'
                }
              ])
              toolsRanThisTurn = false
              continue
            }
            finalResponse = res.text
            break
          }
          if (iters < MAX_ITER) {
            messages = stripReasoning([
              ...messages,
              { role: 'user', content: 'SYSTEM: Continue. Call the next required tool now.' }
            ])
          }
          continue
        }



        toolsRanThisTurn = true
        consecutiveMalformedCount = 0  // valid tool calls arrived — reset malformed counter
        for (const tc of res.toolCalls) {
          // Truncated tool call — response was cut off before JSON closed; skip execution and retry
          if (tc.input['__truncated'] === true) {
            const retries = (truncationRetries.get(tc.name) ?? 0) + 1
            truncationRetries.set(tc.name, retries)
            let truncMsg: string
            if (retries >= 3) {
              truncMsg = `CRITICAL: ${tc.name} has failed ${retries} times because your content is too long. You MUST write a skeleton version under 1500 characters — no inline CSS, no long scripts, just plain semantic HTML. Write the minimal version NOW. You can always improve it afterwards.`
            } else if (retries >= 2) {
              truncMsg = `${tc.name} failed again — still too long. Keep the entire file content under 2500 characters. Remove all decorative CSS, animations, and scripts. Write a clean minimal HTML skeleton now and serve it. Improvements can follow in the next message.`
            } else {
              truncMsg = `Response was truncated — your file content is too long for one call. Write a shorter version (under 4000 characters). You can improve it with a second workspace_write afterwards.`
            }
            messages = stripReasoning([
              ...messages,
              { role: 'tool', content: JSON.stringify({ success: false, error: truncMsg }), tool_call_id: tc.id, name: tc.name }
            ])
            continue
          }
          // Strip internal meta-flags before passing to the tool
          const { __salvaged, __truncated: _t, ...cleanInput } = tc.input as Record<string, unknown>
          void __salvaged; void _t
          allTC.push({ name: tc.name, input: cleanInput })
          let txt: string
          try {
            const result = await this.tools.execute(tc.name, cleanInput)
            lastToolSummary = summarizeToolResult(tc.name, result)
            if (!result.success && String(result.error ?? '').includes('Tool not found') && iters < MAX_ITER) {
              messages = stripReasoning([
                ...messages,
                { role: 'tool', content: JSON.stringify({ success: false, error: `Unknown tool "${tc.name}". Retry immediately with an exact AGENTR tool name. Common exact names: workspace_list, ton_price, ton_balance, ton_get_address.` }), tool_call_id: tc.id, name: tc.name },
                runtimeInstruction('The previous tool name was invalid. Retry immediately with the exact AGENTR tool name. Do not ask the user a question.')
              ])
              continue
            }
            // Capture URLs returned by URL-producing tools so they survive sanitization
            if (result.success && result.data && typeof result.data === 'object') {
              const d = result.data as Record<string, unknown>
              const url = (d['url'] ?? d['link'] ?? d['publicUrl'] ?? '') as string
              if (typeof url === 'string' && url.startsWith('https://')) toolUrls.push(url)
            }
            txt = result.success
              ? this.trunc(JSON.stringify({ success: true, data: result.data ?? 'done' }))
              : this.trunc(JSON.stringify({ success: false, error: result.error ?? 'unknown_error' }))
          } catch (e) {
            txt = this.trunc(JSON.stringify({ success: false, error: `Tool ${tc.name} execution error: ${String(e)}` }))
          }
          messages = stripReasoning([...messages, { role: 'tool', content: txt, tool_call_id: tc.id, name: tc.name }])
        }
      }
    // ─── Restore model + low-credit warning ─────────────────────────────────
    if (limitedMode) if (this.llm.config) this.llm.config.model = _originalModel
    if (limitedMode && finalResponse) {
      finalResponse += "\n\nI'm still here. Your credits ran out, but your agent stays online. Top up with TON to unlock full tool access again."
    } else if (finalResponse && this.config.tenantId && this.getCredits) {
      try {
        const rem = await this.getCredits(this.config.tenantId)
        if (rem > 0 && rem <= 20) {
          finalResponse += '\n\n⚠️ Almost out of credits! Top up with TON to keep going uninterrupted.'
        }
      } catch { /* non-blocking */ }
    }
    // ─────────────────────────────────────────────────────────────────────────
    } catch (e) {
      const errStr = String(e)
      console.error('[Runtime:' + this.config.tenantId + '] LLM loop error:', e)
      if (errStr.includes('429') || errStr.includes('rate_limit')) {
        // Wait 60s and retry once instead of giving up
        console.log('[Runtime:' + this.config.tenantId + '] Rate limited, waiting 60s...')
        await new Promise(r => setTimeout(r, 60_000))
        try {
          const retry = await this.llm.chat({ systemPrompt: await this.sys(), messages: stripReasoning(messages), tools: tools.length > 0 ? tools : undefined })
          const retryNext = stripReasoning(retry.messages)
          if (retry.text.trim()) { finalResponse = retry.text; }
          else { finalResponse = 'Rate limit hit. I waited and retried but could not complete. Please try again.' }
        } catch {
          finalResponse = 'Rate limit hit. Please try again in a moment.'
        }
      } else {
        finalResponse = 'I hit an LLM connection error and did not get a valid response. Try again now.'
      }
    }

    // If agent wrote an HTML/JS/CSS file but never called serve_static, force deploy now
    const wroteWebFile = allTC.some(tc =>
      tc.name === 'workspace_write' &&
      typeof tc.input['path'] === 'string' &&
      /\.(html|htm|js|css)$/i.test(tc.input['path'] as string)
    )
    const didServeStatic = allTC.some(tc => tc.name === 'serve_static')

    if (wroteWebFile && !didServeStatic && iters < MAX_ITER) {
      try {
        const htmlFile = allTC.find(tc =>
          tc.name === 'workspace_write' &&
          typeof tc.input['path'] === 'string' &&
          /\.(html|htm)$/i.test(tc.input['path'] as string)
        )
        const filePath = (htmlFile?.input['path'] as string) ?? 'index.html'
        const nudge: ChatMessage = {
          role: 'user',
          content: `SYSTEM: You wrote ${filePath} but did not call serve_static. Call serve_static now with path="${filePath}" to publish it and get the live URL. Do it immediately.`
        }
        const deployMessages = stripReasoning([...messages, nudge])
        const deployRes = await this.llm.chat({ systemPrompt, messages: deployMessages, tools: tools.length > 0 ? tools : undefined })
        if (deployRes.toolCalls.length > 0) {
          for (const tc of deployRes.toolCalls) {
            allTC.push({ name: tc.name, input: tc.input })
            try {
              const result = await this.tools.execute(tc.name, tc.input)
              if (result.success && result.data && typeof result.data === 'object') {
                const d = result.data as Record<string, unknown>
                const url = (d['url'] ?? d['link'] ?? d['publicUrl'] ?? '') as string
                if (typeof url === 'string' && url.startsWith('https://')) toolUrls.push(url)
              }
            } catch { /* non-blocking */ }
          }
          // One final LLM call to get the URL message
          const finalMessages = stripReasoning([...deployMessages, stripReasoning(deployRes.messages)[deployRes.messages.length - 1]!])
          const finalRes = await this.llm.chat({ systemPrompt, messages: finalMessages, tools: undefined })
          if (finalRes.text.trim()) finalResponse = finalRes.text
        }
      } catch { /* non-blocking — fall through to URL restore */ }
    }

    if (!finalResponse) {
      // Extract what happened from tool calls instead of empty error
      if (toolUrls.length > 0) {
        finalResponse = `Done! ${toolUrls[toolUrls.length - 1]}`
      } else if (lastToolSummary) {
        finalResponse = lastToolSummary
      } else if (allTC.length > 0) {
        finalResponse = `Done! Task complete.`
      } else {
        finalResponse = 'I was unable to complete this request. Please try again.'
      }
    }

    // Always sanitize — strip raw code/HTML that slipped into the reply
    if (lastToolSummary && toolUrls.length === 0 && (directToolSynthesized || /^Done!?\s*(Task complete\.?)?$/i.test(finalResponse.trim()))) {
      finalResponse = lastToolSummary
    }
    finalResponse = sanitizeFinalResponse(finalResponse, allTC.map(tc => tc.name))

    // Cache tool-free responses for repeated queries
    // Never cache responses that contain URLs — they're task-specific and must never bleed into future chats
    const responseHasUrl = finalResponse.includes('https://') || finalResponse.includes('http://')
    if (allTC.length === 0 && !hasPriorTools && !responseHasUrl && userMessage.length < 200 && finalResponse.length > 0 && !isBadUserFacingReply(finalResponse)) {
      const cacheKey = `${chatId}:${userMessage.toLowerCase().trim()}`
      setCache(cacheKey, finalResponse)
    }

    // If sanitizer wiped a URL the agent produced, restore it
    if (toolUrls.length > 0) {
      const latestUrl = toolUrls[toolUrls.length - 1]!
      if (!finalResponse.includes(latestUrl)) {
        finalResponse = finalResponse.trim() + '\n' + latestUrl
      }
    }

    const saved = messages.slice(-15)
    this.conversations.set(chatId, saved)
    if (this.saveConversation) {
      this.saveConversation(this.config.tenantId, chatId, saved).catch(() => {/* non-blocking */})
    }
    return { content: finalResponse, toolCalls: allTC.length > 0 ? allTC : undefined }
  }

  updateLLM(config: LLMConfig): void {
    // Merge into existing config so plan, provisionedAt etc are preserved
    const merged: LLMConfig = { ...(this.llm.config ?? {}), ...config }
    this.llm = new LLMClient(merged)
  }

  getModel(): string {
    return this.llm.config?.model ?? 'btl-2'
  }

  clearHistory(chatId: string): void { this.conversations.delete(chatId) }

  async stop(): Promise<void> { this.conversations.clear() }
  resetConversation(chatId: string): void { this.conversations.delete(chatId) }
  getConversationLength(chatId: string): number { return this.hist(chatId).length }
}
