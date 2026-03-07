import type { AgentContext, Message } from '../types/index.js'
import { ToolRegistry } from './tool-registry.js'

export class AgentRuntime {
  private context: AgentContext
  readonly tools: ToolRegistry

  constructor(context: AgentContext) {
    this.context = context
    this.tools = new ToolRegistry()
  }

  async start(): Promise<void> {
    // TODO: init telegram bridge, llm client, memory
    console.log(`[AgentRuntime] Starting agent for tenant: ${this.context.config.tenantId}`)
  }

  async handleMessage(message: Message): Promise<string> {
    // TODO: agentic loop  LLM  tools  response
    return `Agent received: ${message.content}`
  }

  async stop(): Promise<void> {
    console.log(`[AgentRuntime] Stopping agent for tenant: ${this.context.config.tenantId}`)
  }
}
