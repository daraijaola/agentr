export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export type ToolExecutor<T = Record<string, unknown>> = (
  params: T,
  context: { tenantId: string; chatId?: string; walletAddress?: string }
) => Promise<ToolResult>

export interface ToolEntry {
  tool: Tool
  executor: ToolExecutor
  scope?: 'dm-only' | 'all'
}
