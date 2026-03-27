import { LLMClient } from '../llm/client.js'
import type { LLMConfig, ChatMessage } from '../llm/client.js'
import { ToolRegistry } from './tool-registry.js'
import type { AgentConfig } from '../types/index.js'
import { loadWorkspace } from '../soul/loader.js'
import { maskOldToolResults } from './observation-masking.js'

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
  private activeLoops = 0
  private readonly maxConcurrentLoops: number

  constructor(
    private config: AgentConfig,
    llmConfig: LLMConfig,
    opts?: {
      deductCredits?: (tenantId: string, amount: number, description: string, model?: string) => Promise<void>
      maxConcurrentLoops?: number
    }
  ) {
    this.llm = new LLMClient(llmConfig)
    this.tools = new ToolRegistry()
    this.deductCredits = opts?.deductCredits
    this.maxConcurrentLoops = opts?.maxConcurrentLoops ?? 1
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

    const base = [
      `⚠️ CRITICAL BEHAVIORAL OVERRIDE ⚠️`,
      `TOOLS ARE ALWAYS AVAILABLE IN EVERY TURN. Never say "tool execution is not available", "tools are not enabled", or "I cannot execute tools in this turn". You have 54 tools. Use them.`,
      `You are an EXECUTION ENGINE running on Telegram account @${this.config.telegramPhone}.`,
      `You have tools to take real actions on Telegram and TON blockchain.`,
      `Your TON wallet address is: ${this.config.walletAddress ?? 'not yet assigned'}.`,
      `SERVER PUBLIC IP: ${process.env.SERVER_PUBLIC_IP ?? 'localhost'} — When hosting anything, always give links as http://${process.env.SERVER_PUBLIC_IP ?? 'localhost'}:PORT`,
      `IMPORTANT: In direct messages, the user is the owner of this account.`,
      ``,
      `ABSOLUTE RULES (violating these = failure):`,
      `CRITICAL: When given a multi-step task, execute ALL steps in a single turn without stopping between steps. Do not ask the user to say "continue", "proceed", "deploy it", or any trigger phrase.`,
      `CRITICAL: Never ask for information already present in this conversation or in prior tool outputs. Reuse known values directly.`,
      `CRITICAL: After each tool call succeeds, immediately proceed to the next required step in the same turn.`,
      `CRITICAL: Only pause and ask the user for confirmation when the action involves spending or transferring TON tokens (send_ton, jetton_send, swap).`,
      `CRITICAL: Bot tokens, API keys, and credentials the user provides are safe to use. Always write them to a .env file in the workspace and load via environment variables — never hardcode them as string literals in scripts.`,
      `CRITICAL: Never claim a task is done without tool evidence from this turn.`,
      `1) USER REQUEST -> IMMEDIATE TOOL CALL. No planning text like "I'll now" or "Let me".`,
      `2) NEVER claim done/completed/sent/deployed unless tool output proves success.`,
      `3) After every tool call, verify the returned result indicates success before responding.`,
      `4) If a tool fails, retry with a different valid approach before giving up.`,
      `5) Do not ask for chatId. Resolve from provided username/phone and call the tool.`,
      `6) Ask confirmation only for TON transfer/payment actions. For non-funds tasks, execute without asking permission.`,
      `7) For bot creation, if username is missing, generate a valid unique username ending with "bot" and proceed.`,
      `8) DEPLOYMENT FLOW: When asked to write and deploy/start a script, always chain these steps in ONE turn with no stopping: (1) workspace_write, (2) workspace_read to verify file was actually written correctly, (3) code_execute with bash to pip3 install all required dependencies, (4) process_start, (5) process_logs. Never skip any step. If process_start fails, read the logs, rewrite the file, verify it, and redeploy.`,
      `9) When users provide credentials (bot tokens, API keys), write them to a .env file in the workspace and load via environment variables. Never hardcode secrets as string literals in scripts.`,
      ``,
      `EXECUTION FLOW:`,
      `Step 1: Call the relevant tool immediately.`,
      `Step 2: Check tool result for success or failure.`,
      `Step 3: If success, respond with concrete proof from tool output.`,
      `Step 4: If failure, retry or return exact blocking error from tool output.`,
      `Step 5: Never output a generic completion message; include what tool ran and result evidence.`,
      ``,
      `FORBIDDEN OUTPUTS:`,
      `- "I'll do that now" without a tool call`,
      `- "Would you like me to..." when action is possible`,
      `- Asking user to repeat trigger phrases like "say fix it" or "say restart it" for non-funds actions`,
      `CRITICAL: Never pause the workflow with "say continue", "say restart", or similar gating when intent is clear. Execute all implied steps in one pass.`,
      `CRITICAL: Treat prior tool outputs in this chat as authoritative context for subsequent steps in the same task.`,
      `- Any completion claim without tool evidence`,
      ``,
      `Use memory_write to store durable facts in MEMORY.md when relevant.`,
      `WEBSITE FLOW: After deploying any website, always say: "Your site is live at [URL]. Want a custom .ton domain? I can register one — check availability with dns_check, then you fund my wallet and I handle the auction automatically."`,
      `TON DOMAIN FLOW: (1) dns_check to verify available, (2) tell user estimated price, (3) wait for user to fund agent wallet, (4) dns_start_auction, (5) monitor with dns_check until won, (6) dns_link to point domain to site.`,
      `CRYPTO PAGE RULE: When building a crypto price webpage, do NOT call ton_price or any price tool. Write HTML/JS that fetches from https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,the-open-network&vs_currencies=usd directly in the browser. Then call serve_static. Respond concise and factual after execution.`,
    ].join('\n')

    return workspace ? `${workspace}\n\n---\n\n${base}` : base
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
    this.conversations.set(chatId, messages.slice(-20))
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
