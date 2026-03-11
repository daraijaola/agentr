import { LLMClient } from '../llm/client.js'
import type { LLMConfig, ChatMessage } from '../llm/client.js'
import { ToolRegistry } from './tool-registry.js'
import type { AgentConfig } from '../types/index.js'
import { loadWorkspace } from '../soul/loader.js'

const MAX_ITER = 40
const MAX_SIZE = 3500

export interface ProcessMessageOptions { chatId: string; userMessage: string; userName?: string; isGroup?: boolean; messageId?: number }
export interface AgentResponse { content: string; toolCalls?: Array<{ name: string; input: Record<string, unknown> }> }

function stripReasoning(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map(m => { const { reasoning_content, ...rest } = m as Record<string, unknown>; void reasoning_content; return rest as ChatMessage })
}

export class AgentRuntime {
  private llm: LLMClient
  readonly tools: ToolRegistry
  private conversations = new Map<string, ChatMessage[]>()

  constructor(private config: AgentConfig, llmConfig: LLMConfig) {
    this.llm = new LLMClient(llmConfig)
    this.tools = new ToolRegistry()
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
    try { workspace = await loadWorkspace(this.config.tenantId) } catch { /* not ready */ }

    const base = [
      `⚠️ CRITICAL BEHAVIORAL OVERRIDE ⚠️`,
      `You are an EXECUTION ENGINE running on Telegram account @${this.config.telegramPhone}.`,
      `You have tools to take real actions on Telegram and TON blockchain.`,
      `Your TON wallet address is: ${this.config.walletAddress ?? 'not yet assigned'}.`,
      `IMPORTANT: In direct messages, the user is the owner of this account.`,
      ``,
      `ABSOLUTE RULES (violating these = failure):`,
      `1) USER REQUEST -> IMMEDIATE TOOL CALL. No planning text like "I'll now" or "Let me".`,
      `2) NEVER claim done/completed/sent/deployed unless tool output proves success.`,
      `3) After every tool call, verify the returned result indicates success before responding.`,
      `4) If a tool fails, retry with a different valid approach before giving up.`,
      `5) Do not ask for chatId. Resolve from provided username/phone and call the tool.`,
      `6) Ask confirmation only for TON transfer/payment actions.`,
      ``,
      `EXECUTION FLOW:`,
      `Step 1: Call the relevant tool immediately.`,
      `Step 2: Check tool result for success or failure.`,
      `Step 3: If success, respond with concrete proof from tool output.`,
      `Step 4: If failure, retry or return exact blocking error from tool output.`,
      ``,
      `FORBIDDEN OUTPUTS:`,
      `- "I'll do that now" without a tool call`,
      `- "Would you like me to..." when action is possible`,
      `- Any completion claim without tool evidence`,
      ``,
      `Use memory_write to store durable facts in MEMORY.md when relevant.`,
      `Respond concise and factual after execution.`,
    ].join('\n')

    return workspace ? `${workspace}\n\n---\n\n${base}` : base
  }

  async processMessage(opts: ProcessMessageOptions): Promise<AgentResponse> {
    const { chatId, userMessage, userName } = opts
    const envelope = userName ? `[${userName}] ${userMessage}` : userMessage
    let messages: ChatMessage[] = [...stripReasoning(this.hist(chatId)), { role: 'user', content: envelope }]
    const tools = this.tools.list().map(t => ({ name: t.name, description: t.description, inputSchema: t.parameters }))
    let iters = 0, finalResponse = ''
    const allTC: Array<{ name: string; input: Record<string, unknown> }> = []
    const systemPrompt = await this.sys()

    try {
      while (iters < MAX_ITER) {
        iters++
        const res = await this.llm.chat({ systemPrompt, messages, tools: tools.length > 0 ? tools : undefined })
        messages = stripReasoning(res.messages)

        if (res.toolCalls.length === 0) {
          finalResponse = res.text
          break
        }

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
      finalResponse = `Sorry, I ran into an error: ${String(e)}. Please try again.`
    }

    if (!finalResponse) finalResponse = 'I completed the requested actions.'
    this.conversations.set(chatId, messages.slice(-40))
    return { content: finalResponse, toolCalls: allTC.length > 0 ? allTC : undefined }
  }

  async stop(): Promise<void> { this.conversations.clear() }
  resetConversation(chatId: string): void { this.conversations.delete(chatId) }
  getConversationLength(chatId: string): number { return this.hist(chatId).length }
}
