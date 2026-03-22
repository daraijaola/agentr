import type { Tool } from '../../agent/tool-registry.js'
import type { TelegramUserClient } from '../../telegram/client.js'

export function createSendMessageTool(client: TelegramUserClient): Tool {
  return {
    name: 'send_message',
    description: 'Send a message to a Telegram chat, group, or channel by username or chat ID.',
    parameters: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: 'Username (@username) or chat ID to send the message to',
        },
        text: {
          type: 'string',
          description: 'The message text to send',
        },
        silent: {
          type: 'boolean',
          description: 'Send without notification (optional)',
        },
      },
      required: ['chat', 'text'],
    },
    execute: async (params) => {
      try {
        const chat = params['chat'] as string
        const text = params['text'] as string
        const silent = params['silent'] as boolean | undefined
        await client.sendMessage(chat, text, { silent })
        return { success: true, data: { sent: true, chat, length: text.length } }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  }
}
