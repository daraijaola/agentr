import type { Tool } from '../../agent/tool-registry.js'
import type { TelegramUserClient } from '../../telegram/client.js'

export function createGetDialogsTool(client: TelegramUserClient): Tool {
  return {
    name: 'get_dialogs',
    description: 'Get a list of all chats, groups, and channels the user is part of.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async () => {
      try {
        const dialogs = await client.getDialogs()
        return { success: true, data: dialogs }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  }
}
