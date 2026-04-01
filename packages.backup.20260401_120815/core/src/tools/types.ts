export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
  category?: string
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export type ToolExecutor<T = Record<string, unknown>> = (
  params: T,
  context: {
    tenantId: string
    chatId?: string
    walletAddress?: string
    mnemonic?: string[]
    bridge?: unknown
    config?: unknown
    db?: unknown
    senderId?: number
    isGroup?: boolean
    [key: string]: unknown
  }
) => Promise<ToolResult>

export interface ToolEntry {
  tool: Tool
  executor: ToolExecutor<any>
  scope?: 'dm-only' | 'all' | 'group-only' | 'always'
}

export type ToolContext = {
  tenantId: string
  chatId?: string
  walletAddress?: string
  mnemonic?: string[]
  bridge?: unknown
  config?: unknown
  db?: unknown
  senderId?: number
  isGroup?: boolean
  [key: string]: unknown
}
