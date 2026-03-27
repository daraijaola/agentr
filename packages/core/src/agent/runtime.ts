import { LLMClient } from '../llm/client.js'
import type { LLMConfig, ChatMessage } from '../llm/client.js'
import { ToolRegistry } from './tool-registry.js'
import type { AgentConfig } from '../types/index.js'
import { loadWorkspace } from '../soul/loader.js'
import { maskOldToolResults } from './observation-masking.js'
import { buildSystemPrompt } from './prompts/system.js'

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
    let workspace = ''
    try {
      const raw = await loadWorkspace(this.config.tenantId)
      workspace = raw.length > 800 ? raw.slice(0, 800) + '\n...[workspace truncated]' : raw
    } catch { /* not ready */ }

    return buildSystemPrompt(
      this.config.telegramPhone,
      this.config.walletAddress,
      process.env['SERVER_PUBLIC_IP'] ?? 'localhost',
      workspace || undefined,
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
    const trimmedHist = histMessages.length > 60 ? histMessages.slice(-60) : histMessages
    let messages: ChatMessage[] = [...trimmedHist, { role: 'user', content: envelope }]
    const tools = this.tools.list().map(t => ({
      name: t.name,
      description: t.description.slice(0, 300),
      inputSchema: t.parameters
    }))
    let iters = 0, finalResponse = ''
    const allTC: Array<{ name: string; input: Record<string, unknown> }> = []
    const systemPrompt = await this.sys()
    let toolsRanThisTurn = false

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

        // Deduct credits based on provider (skip for codex - free tier)
        const provider = this.llm.getProvider?.() ?? ''
        if (provider !== 'openai-codex' && this.config.tenantId && this.deductCredits) {
          const CREDIT_COST: Record<string, number> = {
            'moonshot': 3, 'openai': 9, 'anthropic': 13, 'gemini': 8
          }
          const cost = CREDIT_COST[provider] ?? 3
          try {
            await this.deductCredits(this.config.tenantId, cost, 'LLM call', provider)
          } catch { /* non-blocking */ }
        }

        if (res.toolCalls.length === 0) {
          if (res.text.trim().length > 0) {
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
        for (const tc of res.toolCalls) {
          allTC.push({ name: tc.name, input: tc.input })
          let txt: string
          try {
            const result = await this.tools.execute(tc.name, tc.input)
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

    if (!finalResponse) {
      // Extract what happened from tool calls instead of empty error
      if (allTC.length > 0) {
        const toolSummary = allTC.map(tc => tc.name).join(', ')
        finalResponse = `Executed: ${toolSummary}. Task complete.`
      } else {
        finalResponse = 'I was unable to complete this request. Please try again.'
      }
    }
    const saved = messages.slice(-20)
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
