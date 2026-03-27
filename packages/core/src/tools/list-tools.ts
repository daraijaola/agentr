import type { ToolRegistry } from '../agent/tool-registry.js'

export function registerListToolsTool(registry: ToolRegistry): void {
  registry.register({
    name: 'list_tools',
    description: 'List all available tools with their names and descriptions. Use this to discover what you can do.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional: filter by category keyword (e.g. "ton", "telegram", "deploy")',
        },
      },
      required: [],
    },
    execute: async (params: Record<string, unknown>) => {
      const filter = (params['category'] as string | undefined)?.toLowerCase()
      const all = registry.list()
      const filtered = filter
        ? all.filter(t => t.name.includes(filter) || t.description.toLowerCase().includes(filter))
        : all
      return {
        success: true,
        data: {
          total: all.length,
          shown: filtered.length,
          tools: filtered.map(t => ({ name: t.name, description: t.description })),
        },
      }
    },
  })
}
