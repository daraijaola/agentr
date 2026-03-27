export interface AgentConfig {
  tenantId: string
  userId: string
  telegramPhone: string
  llmProvider: 'anthropic' | 'openai' | 'moonshot' | 'openai-codex' | 'air'
  walletAddress?: string
  plan?: 'starter' | 'pro' | 'ultra' | 'elite' | 'enterprise'
  provisionedAt?: number // Unix ms — used for starter plan 24h expiry
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
  plan: 'starter' | 'pro' | 'ultra' | 'elite' | 'enterprise'
  status: 'pending' | 'active' | 'suspended'
  createdAt: Date
}
