import type { Tool } from '../tool-registry.js'
import type { TelegramUserClient } from '../../telegram/client.js'

export function createGetMessagesTool(client: TelegramUserClient): Tool {
  return {
    name: 'get_messages',
    description: 'Get recent messages from a Telegram chat, group, or channel.',
    parameters: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: 'Username (@username) or chat ID to fetch messages from',
        },
        limit: {
          type: 'number',
          description: 'Number of messages to fetch (default: 20, max: 50)',
        },
      },
      required: ['chat'],
    },
    execute: async (params) => {
      try {
        const chat = params['chat'] as string
        const limit = Math.min((params['limit'] as number | undefined) ?? 20, 50)
        const messages = await client.getMessages(chat, limit)
        const result = messages.map((m) => ({
          id: m.id,
          text: m.message ?? '',
          date: m.date,
          fromId: m.fromId?.toString() ?? 'unknown',
        }))
        return { success: true, data: result }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  }
}
