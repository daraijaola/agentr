import type { ToolRegistry } from '../agent/tool-registry.js'

export function registerListToolsTool(registry: ToolRegistry): void {
  registry.register({
    name: 'list_tools',
    description: 'List all available tools. Returns plain grouped text — do NOT add any extra formatting, just relay the output as-is.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional: filter by prefix keyword (e.g. "ton", "telegram", "deploy", "workspace")',
        },
      },
      required: [],
    },
    execute: async (params: Record<string, unknown>) => {
      const filter = (params['category'] as string | undefined)?.toLowerCase().trim()
      const all = registry.list()
      const filtered = filter
        ? all.filter(t => t.name.includes(filter))
        : all

      // Group by prefix (e.g. ton_, telegram_, workspace_, etc.)
      const groups: Record<string, string[]> = {}
      for (const t of filtered) {
        const prefix = t.name.includes('_') ? t.name.split('_')[0]! : 'other'
        if (!groups[prefix]) groups[prefix] = []
        groups[prefix]!.push(t.name)
      }

      const lines: string[] = [`${all.length} tools total${filter ? ` (${filtered.length} matching "${filter}")` : ''}:`]
      for (const [group, names] of Object.entries(groups).sort()) {
        lines.push(`\n${group.toUpperCase()}: ${names.join(', ')}`)
      }

      // Return as plain text so the LLM can relay it directly
      return {
        success: true,
        data: lines.join('\n'),
      }
    },
  })
}
