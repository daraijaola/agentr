import type { ToolResult } from '../types/index.js'

export type ToolFn = (params: Record<string, unknown>) => Promise<ToolResult>

export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: ToolFn
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) return { success: false, error: `Tool not found: ${name}` }
    try {
      return await tool.execute(params)
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}
