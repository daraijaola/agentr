import type { Context, Tool, ToolCall, TextContent, ToolResultMessage } from '@mariozechner/pi-ai'
import { LLMClient } from '../llm/client.js'
import type { LLMConfig } from '../llm/client.js'
import { ToolRegistry } from './tool-registry.js'
import type { AgentContext } from '../types/index.js'

// AgentRuntime  agentic loop for AGENTR
// Adapted from Teleton (MIT)  simplified for MVP, complexity added in later phases
// Core loop: receive message  build context  LLM  execute tools  respond

const MAX_TOOL_ITERATIONS = 10 // prevent infinite loops
const MAX_TOOL_RESULT_SIZE = 8000 // truncate large tool outputs

export interface ProcessMessageOptions {
  chatId: string
  userMessage: string
  userName?: string
  isGroup?: boolean
  messageId?: number
}

export interface AgentResponse {
  content: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>
}

export class AgentRuntime {
  private context: AgentContext
  private llm: LLMClient
  readonly tools: ToolRegistry

  // Per-chat conversation history (in-memory for MVP, SQLite in Phase 2)
  private conversations = new Map<string, Context>()

  constructor(agentContext: AgentContext, llmConfig: LLMConfig) {
    this.context = agentContext
    this.llm = new LLMClient(llmConfig)
    this.tools = new ToolRegistry()
  }

  private getConversation(chatId: string): Context {
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, { messages: [] })
    }
    return this.conversations.get(chatId)!
  }

  private truncateToolResult(result: string): string {
    if (result.length <= MAX_TOOL_RESULT_SIZE) return result
    return result.slice(0, MAX_TOOL_RESULT_SIZE) + '\n... [truncated]'
  }

  private buildSystemPrompt(): string {
    const { config } = this.context
    return [
      `You are an AI agent for ${config.userId} on Telegram.`,
      `You have access to tools that let you take real actions on Telegram and TON blockchain.`,
      `Your wallet address is: ${config.walletAddress ?? 'not yet assigned'}.`,
      `Always be helpful, concise, and action-oriented.`,
      `When a user asks you to do something, use your tools to do it  don't just describe how.`,
      `If a tool fails, explain what happened and suggest alternatives.`,
    ].join('\n')
  }

  async processMessage(opts: ProcessMessageOptions): Promise<AgentResponse> {
    const { chatId, userMessage, userName } = opts

    // Build message envelope (who said what, when)
    const envelope = userName
      ? `[${userName}] ${userMessage}`
      : userMessage

    // Get or create conversation context for this chat
    let ctx = this.getConversation(chatId)

    // Add user message to context
    ctx = {
      ...ctx,
      systemPrompt: this.buildSystemPrompt(),
      messages: [
        ...ctx.messages,
        { role: 'user' as const, content: envelope },
      ],
    }

    // Get registered tools for LLM
    const piTools: Tool[] = this.tools.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    }))

    let iterations = 0
    let finalResponse = ''
    const allToolCalls: Array<{ name: string; input: Record<string, unknown> }> = []

    // Agentic loop  LLM calls tools until it produces a text response
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      const response = await this.llm.chat({
        context: ctx,
        tools: piTools.length > 0 ? piTools : undefined,
      })

      // Update context with assistant response
      ctx = response.context

      // Check if LLM wants to use tools
      const toolCalls = response.message.content.filter(
        (b): b is ToolCall => b.type === 'toolCall'
      )

      if (toolCalls.length === 0) {
        // No tool calls  we have the final text response
        const textBlocks = response.message.content.filter(
          (b): b is TextContent => b.type === 'text'
        )
        finalResponse = textBlocks.map((b) => b.text).join('')
        break
      }

      // Execute all tool calls
      const toolResults: ToolResultMessage[] = []

      for (const toolCall of toolCalls) {
        allToolCalls.push({ name: toolCall.name, input: toolCall.input as Record<string, unknown> })

        const result = await this.tools.execute(
          toolCall.name,
          toolCall.input as Record<string, unknown>
        )

        const resultText = result.success
          ? this.truncateToolResult(JSON.stringify(result.data ?? 'done'))
          : `Error: ${result.error}`

        toolResults.push({
          role: 'toolResult' as const,
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          content: resultText,
          isError: !result.success,
        })
      }

      // Add tool results to context for next iteration
      ctx = {
        ...ctx,
        messages: [...ctx.messages, ...toolResults],
      }
    }

    if (!finalResponse) {
      finalResponse = 'I completed the requested actions.'
    }

    // Save updated conversation
    this.conversations.set(chatId, ctx)

    return {
      content: finalResponse,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    }
  }

  resetConversation(chatId: string): void {
    this.conversations.delete(chatId)
  }

  getConversationLength(chatId: string): number {
    return this.getConversation(chatId).messages.length
  }
}
