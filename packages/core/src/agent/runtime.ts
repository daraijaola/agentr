import { LLMClient } from '../llm/client.js'
import type { LLMConfig, ChatMessage } from '../llm/client.js'
import { ToolRegistry } from './tool-registry.js'
import type { AgentConfig } from '../types/index.js'
const MAX_ITER = 10
const MAX_SIZE = 8000
export interface ProcessMessageOptions { chatId: string; userMessage: string; userName?: string; isGroup?: boolean; messageId?: number }
export interface AgentResponse { content: string; toolCalls?: Array<{ name: string; input: Record<string, unknown> }> }

function stripReasoning(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map(m => { const { reasoning_content, ...rest } = m as Record<string, unknown>; void reasoning_content; return rest as ChatMessage })
}

export class AgentRuntime {
  private llm: LLMClient
  readonly tools: ToolRegistry
  private conversations = new Map<string, ChatMessage[]>()
  constructor(private config: AgentConfig, llmConfig: LLMConfig) { this.llm = new LLMClient(llmConfig); this.tools = new ToolRegistry() }
  private hist(chatId: string): ChatMessage[] { if (!this.conversations.has(chatId)) this.conversations.set(chatId, []); return this.conversations.get(chatId)! }
  private trunc(s: string): string { return s.length <= MAX_SIZE ? s : s.slice(0, MAX_SIZE) + '\n...[truncated]' }
  private sys(): string { return [`You are an AI agent running on the Telegram account @${this.config.telegramPhone}.`, `You have access to tools to take real actions on Telegram and TON blockchain.`, `Your TON wallet address is: ${this.config.walletAddress ?? 'not yet assigned'}.`, `IMPORTANT: When a user messages you directly, they ARE the owner of this account. You are their assistant.`, `When sending messages, use the username or phone number directly as chatId (e.g. '@username' or '+2348012345678').`, `To send a message to someone, use telegram_send_message with their @username as chatId.`, `Never ask for a chatId — resolve it from the username the user gives you.`, `Always be helpful, concise, and action-oriented. Respond in plain English.`, `If a tool fails, explain briefly and try an alternative.`].join('\n') }
  async processMessage(opts: ProcessMessageOptions): Promise<AgentResponse> {
    const { chatId, userMessage, userName } = opts
    const envelope = userName ? `[${userName}] ${userMessage}` : userMessage
    let messages: ChatMessage[] = [...stripReasoning(this.hist(chatId)), { role: 'user', content: envelope }]
    const tools = this.tools.list().map(t => ({ name: t.name, description: t.description, inputSchema: t.parameters }))
    let iters = 0, finalResponse = ''
    const allTC: Array<{ name: string; input: Record<string, unknown> }> = []
    try {
      while (iters < MAX_ITER) {
        iters++
        const res = await this.llm.chat({ systemPrompt: this.sys(), messages, tools: tools.length > 0 ? tools : undefined })
        messages = stripReasoning(res.messages)
        if (res.toolCalls.length === 0) { finalResponse = res.text; break }
        for (const tc of res.toolCalls) {
          allTC.push({ name: tc.name, input: tc.input })
          let txt: string
          try {
            const result = await this.tools.execute(tc.name, tc.input)
            txt = result.success ? this.trunc(JSON.stringify(result.data ?? 'done')) : `Tool attempted but failed: ${result.error}. Continue helping the user.`
          } catch (e) {
            txt = `Tool ${tc.name} could not be executed: ${String(e)}. Continue helping the user with what you know.`
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
