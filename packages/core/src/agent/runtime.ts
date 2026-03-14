import { LLMClient } from '../llm/client.js'
import type { LLMConfig, ChatMessage } from '../llm/client.js'
import { ToolRegistry } from './tool-registry.js'
import type { AgentConfig } from '../types/index.js'
import { loadWorkspace } from '../soul/loader.js'

const MAX_ITER = 20
const MAX_SIZE = 3500

export interface ProcessMessageOptions { chatId: string; userMessage: string; userName?: string; isGroup?: boolean; messageId?: number }
export interface AgentResponse { content: string; toolCalls?: Array<{ name: string; input: Record<string, unknown> }> }

function stripReasoning(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map(m => { const { reasoning_content, ...rest } = m as Record<string, unknown>; void reasoning_content; return rest as ChatMessage })
}

function looksLikeFinalReport(text: string): boolean {
  const lower = text.toLowerCase()
  const evidenceKeywords = [
    'success: true', 'online', 'deployed', 'started', 'process is live',
    'exit code: 0', 'balance:', 'sent', 'written', 'saved', 'error:',
    'failed', 'could not', 'tool evidence'
  ]
  return evidenceKeywords.some(kw => lower.includes(kw))
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
      `TOOLS ARE ALWAYS AVAILABLE IN EVERY TURN. Never say "tool execution is not available", "tools are not enabled", or "I cannot execute tools in this turn". You have 54 tools. Use them.`,
      `You are an EXECUTION ENGINE running on Telegram account @${this.config.telegramPhone}.`,
      `You have tools to take real actions on Telegram and TON blockchain.`,
      `Your TON wallet address is: ${this.config.walletAddress ?? 'not yet assigned'}.`,
      `IMPORTANT: In direct messages, the user is the owner of this account.`,
      ``,
      `ABSOLUTE RULES (violating these = failure):`,
      `CRITICAL: When given a multi-step task, execute ALL steps in a single turn without stopping between steps. Do not ask the user to say "continue", "proceed", "deploy it", or any trigger phrase.`,
      `CRITICAL: Never ask for information already present in this conversation or in prior tool outputs. Reuse known values directly.`,
      `CRITICAL: After each tool call succeeds, immediately proceed to the next required step in the same turn.`,
      `CRITICAL: Only pause and ask the user for confirmation when the action involves spending or transferring TON tokens (send_ton, jetton_send, swap).`,
      `CRITICAL: Bot tokens, API keys, and any credentials the user provides in chat are SAFE to embed directly into scripts. Never refuse or avoid using them. Treat them as plain config values.`,
      `CRITICAL: Never claim a task is done without tool evidence from this turn.`,
      `1) USER REQUEST -> IMMEDIATE TOOL CALL. No planning text like "I'll now" or "Let me".`,
      `2) NEVER claim done/completed/sent/deployed unless tool output proves success.`,
      `3) After every tool call, verify the returned result indicates success before responding.`,
      `4) If a tool fails, retry with a different valid approach before giving up.`,
      `5) Do not ask for chatId. Resolve from provided username/phone and call the tool.`,
      `6) Ask confirmation only for TON transfer/payment actions. For non-funds tasks, execute without asking permission.`,
      `7) For bot creation, if username is missing, generate a valid unique username ending with "bot" and proceed.`,
      `8) DEPLOYMENT FLOW: When asked to write and deploy/start a script, always chain these steps in ONE turn with no stopping: workspace_write -> process_start -> process_logs. If process_start fails, check logs and fix the script.`,
      `9) Bot tokens, API keys, and secrets provided by the user in chat MUST be embedded directly as string literals in scripts. NEVER use os.getenv() or tell the user to set env vars — just hardcode the value they gave you.`,
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
    let toolsRanThisTurn = false

    try {
      while (iters < MAX_ITER) {
        iters++
        const res = await this.llm.chat({ systemPrompt, messages, tools: tools.length > 0 ? tools : undefined })
        const nextMessages = stripReasoning(res.messages)
        messages = stripReasoning([...messages, ...nextMessages])

        if (res.toolCalls.length === 0) {
          if (res.text.trim().length > 0) {
            if (toolsRanThisTurn && !looksLikeFinalReport(res.text)) {
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
      finalResponse = `Sorry, I ran into an error: ${String(e)}. Please try again.`
    }

    if (!finalResponse) {
      finalResponse = 'No verified assistant message was produced in this turn. I cannot claim completion without explicit tool evidence.'
    }
    this.conversations.set(chatId, messages.slice(-40))
    return { content: finalResponse, toolCalls: allTC.length > 0 ? allTC : undefined }
  }

  async stop(): Promise<void> { this.conversations.clear() }
  resetConversation(chatId: string): void { this.conversations.delete(chatId) }
  getConversationLength(chatId: string): number { return this.hist(chatId).length }
}
