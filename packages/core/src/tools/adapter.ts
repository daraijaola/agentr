import { Value } from '@sinclair/typebox/value'
import type { TSchema } from '@sinclair/typebox'
import type { ToolEntry } from './teleton/types.js'
import type { Tool } from '../agent/tool-registry.js'
import type { TelegramUserClient } from '../telegram/client.js'
import type Database from 'better-sqlite3'

export interface AdapterContext {
  client: TelegramUserClient
  db: Database.Database
  chatId: string
  tenantId: string
  walletAddress?: string
  mnemonic?: string[]
}

export function adaptTeletonTools(entries: ToolEntry[], adapterCtx: AdapterContext): Tool[] {
  const { client } = adapterCtx

  // Bridge object that matches what ALL Teleton tools expect
  const bridge = {
    // tools call: context.bridge.getClient().getClient() to get raw GramJS
    getClient: () => ({
      getClient: () => client.getClient(),
      // some tools call methods directly on getClient() result
      sendMessage: (entity: string, opts: Record<string, unknown>) =>
        client.getClient().sendMessage(entity as never, opts as never),
      getMessages: (entity: string, opts: Record<string, unknown>) =>
        client.getClient().getMessages(entity as never, opts as never),
      invoke: (request: unknown) => client.getClient().invoke(request as never),
      getDialogs: (opts?: Record<string, unknown>) =>
        client.getClient().getDialogs(opts as never),
      getMe: () => client.getClient().getMe(),
    }),
    // tools call: context.bridge.sendMessage({chatId, text, replyToId})
    sendMessage: (p: { chatId: string; text: string; replyToId?: number }) =>
      client.sendMessage(p.chatId, p.text, { replyTo: p.replyToId }),
    getMessages: (p: { chatId: string; limit?: number }) =>
      client.getMessages(p.chatId, p.limit),
    getDialogs: () => client.getDialogs(),
    resolveUsername: (username: string) => client.resolveUsername(username),
    setTyping: (p: { chatId: string } | string) =>
      client.setTyping(typeof p === 'string' ? p : p.chatId),
    getMe: () => client.getMe(),
  }

  return entries.map((entry) => {
    const { tool, executor } = entry
    const toolContext = {
      bridge,
      db: adapterCtx.db,
      chatId: adapterCtx.chatId,
      senderId: 0,
      isGroup: false,
      tenantId: adapterCtx.tenantId,
      walletAddress: adapterCtx.walletAddress,
      mnemonic: adapterCtx.mnemonic,
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
      execute: async (params: Record<string, unknown>) => {
        try {
          const schema = tool.parameters as TSchema
          if (!Value.Check(schema, params)) {
            const errors = [...Value.Errors(schema, params)]
            return { success: false, error: `Invalid params: ${errors.map((e) => e.message).join(', ')}` }
          }
          return await executor(params, toolContext as never)
        } catch (err) {
          return { success: false, error: String(err) }
        }
      },
    }
  })
}
