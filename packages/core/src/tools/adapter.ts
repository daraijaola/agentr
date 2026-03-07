import { Value } from '@sinclair/typebox/value'
import type { TSchema } from '@sinclair/typebox'
import type { ToolEntry, ToolContext } from './teleton/types.js'
import type { Tool } from '../agent/tool-registry.js'
import type { TelegramUserClient } from '../telegram/client.js'
import type Database from 'better-sqlite3'

// ToolAdapter  bridges Teleton MIT tool format  AGENTR ToolRegistry format
// Teleton tools: { tool: Tool, executor: ToolExecutor } + ToolContext
// AGENTR tools:  { name, description, parameters, execute(params) }

export interface AdapterContext {
  client: TelegramUserClient
  db: Database.Database
  chatId: string
  tenantId: string
}

export function adaptTeletonTools(
  entries: ToolEntry[],
  adapterCtx: AdapterContext
): Tool[] {
  return entries.map((entry) => {
    const { tool, executor } = entry

    // Build Teleton ToolContext from our AdapterContext
    const toolContext: ToolContext = {
      // Teleton expects a TelegramBridge shape with getClient()
      bridge: {
        getClient: () => adapterCtx.client,
      } as never,
      db: adapterCtx.db,
      chatId: adapterCtx.chatId,
      senderId: 0, // populated per-message in Phase 2
      isGroup: false,
    }

    return {
      name: tool.name,
      description: tool.description,
      // Convert TypeBox schema to plain JSON schema for pi-ai
      parameters: tool.parameters as Record<string, unknown>,
      execute: async (params: Record<string, unknown>) => {
        try {
          // Validate params against TypeBox schema
          const schema = tool.parameters as TSchema
          if (!Value.Check(schema, params)) {
            const errors = [...Value.Errors(schema, params)]
            return {
              success: false,
              error: `Invalid params: ${errors.map((e) => e.message).join(', ')}`,
            }
          }

          return await executor(params, toolContext)
        } catch (err) {
          return { success: false, error: String(err) }
        }
      },
    }
  })
}
