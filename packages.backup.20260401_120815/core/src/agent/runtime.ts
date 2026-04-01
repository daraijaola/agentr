import { LLMClient } from '../llm/client.js'
import type { LLMConfig, ChatMessage } from '../llm/client.js'
import { ToolRegistry } from './tool-registry.js'
import type { AgentConfig } from '../types/index.js'
import { loadWorkspace } from '../soul/loader.js'
import { maskOldToolResults } from './observation-masking.js'
import { buildSystemPrompt } from './prompts/system.js'

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
  // Evict old entries if cache gets large
  if (responseCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of responseCache) { if (now > v.expiry) responseCache.delete(k) }
  }
  responseCache.set(key, { response, expiry: Date.now() + CACHE_TTL_MS })
}

function sanitizeForAnthropic(messages: any[]): any[] {
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

/**
 * Strip any code/HTML that slipped into the final user-facing response.
 * Non-technical users must never see raw source code in chat.
 */
function sanitizeFinalResponse(text: string, toolsUsed: string[]): string {
  let t = text.trim()

  // Remove fenced code blocks entirely
  t = t.replace(/```[\s\S]*?```/g, '').trim()

  // Strip unparsed <function_calls> XML blocks (Claude native format that leaked through)
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

export class AgentRuntime {
  private llm: LLMClient
  readonly tools: ToolRegistry
  private conversations = new Map<string, ChatMessage[]>()
  private deductCredits?: (tenantId: string, amount: number, description: string, model?: string) => Promise<void>
  private saveConversation?: (tenantId: string, chatId: string, messages: unknown[]) => Promise<void>
  private activeLoops = 0
  private readonly maxConcurrentLoops: number
  /** Optional override — when set, replaces the default system prompt builder */
  public systemPromptOverride?: () => Promise<string> | string

  constructor(
    private config: AgentConfig,
    llmConfig: LLMConfig,
    opts?: {
      deductCredits?: (tenantId: string, amount: number, description: string, model?: string) => Promise<void>
      saveConversation?: (tenantId: string, chatId: string, messages: unknown[]) => Promise<void>
      maxConcurrentLoops?: number
    }
  ) {
    this.llm = new LLMClient(llmConfig)
    this.tools = new ToolRegistry()
    this.deductCredits = opts?.deductCredits
    this.saveConversation = opts?.saveConversation
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
    const { chatId, userMessage, userName } = opts
    const envelope = userName ? `[${userName}] ${userMessage}` : userMessage
    const histMessages = stripReasoning(this.hist(chatId))
    const trimmedHist = histMessages.length > 30 ? histMessages.slice(-30) : histMessages
    let messages: ChatMessage[] = [...trimmedHist, { role: 'user', content: envelope }]
    const tools = this.tools.list().map(t => ({
      name: t.name,
      description: t.description.slice(0, 300),
      inputSchema: t.parameters
    }))
    let iters = 0, finalResponse = ''
    const allTC: Array<{ name: string; input: Record<string, unknown> }> = []
    const toolUrls: string[] = []  // URLs returned by serve_static, dns_link, etc.
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
        console.log('[Runtime:' + this.config.tenantId + '] LLM done iter ' + iters + ' text:' + res.text.slice(0, 50))
        // res.messages = [...full input history, newAssistantMsg]
        // Only append the NEW assistant message — do NOT re-append the input history or
        // the conversation doubles in size every iteration (exponential context explosion).
        const allNext = stripReasoning(res.messages)
        const newAssistantMsg = allNext[allNext.length - 1]
        if (newAssistantMsg) messages = [...messages, newAssistantMsg]

        // Deduct credits per LLM call
        if (this.config.tenantId && this.deductCredits) {
          try {
            await this.deductCredits(this.config.tenantId, 3, 'LLM call', 'air')
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
            // If first iteration and no tools run yet and response is short,
            // the LLM is just acknowledging ("On it!", "Sure!", "Give me a moment...")
            // — nudge it to start executing immediately instead of treating it as done
            if (iters === 1 && !toolsRanThisTurn && res.text.trim().length < 120) {
              messages = stripReasoning([
                ...messages,
                {
                  role: 'user',
                  content: 'SYSTEM: Do not send acknowledgements — start executing tool calls immediately to complete the task.'
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
    } catch (e) {
      const errStr = String(e)
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
        finalResponse = `Sorry, I ran into an error: ${errStr}. Please try again.`
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
      } else if (allTC.length > 0) {
        finalResponse = `Done! Task complete.`
      } else {
        finalResponse = 'I was unable to complete this request. Please try again.'
      }
    }

    // Always sanitize — strip raw code/HTML that slipped into the reply
    finalResponse = sanitizeFinalResponse(finalResponse, allTC.map(tc => tc.name))

    // Cache tool-free responses for repeated queries
    // Never cache responses that contain URLs — they're task-specific and must never bleed into future chats
    const responseHasUrl = finalResponse.includes('https://') || finalResponse.includes('http://')
    if (allTC.length === 0 && !hasPriorTools && !responseHasUrl && userMessage.length < 200 && finalResponse.length > 0) {
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
    this.llm = new LLMClient(config)
  }

  clearHistory(chatId: string): void { this.conversations.delete(chatId) }

  async stop(): Promise<void> { this.conversations.clear() }
  resetConversation(chatId: string): void { this.conversations.delete(chatId) }
  getConversationLength(chatId: string): number { return this.hist(chatId).length }
}
