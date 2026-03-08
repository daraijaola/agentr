export interface AgentConfig {
  tenantId: string
  userId: string
  telegramPhone: string
  llmProvider: 'anthropic' | 'openai' | 'moonshot'
  walletAddress?: string
}

export interface AgentContext {
  config: AgentConfig
  sessionPath: string
  workspacePath: string
  dbPath: string
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface Tenant {
  id: string
  userId: string
  phone: string
  walletAddress: string
  plan: 'starter' | 'builder' | 'pro' | 'enterprise'
  status: 'pending' | 'active' | 'suspended'
  createdAt: Date
}
