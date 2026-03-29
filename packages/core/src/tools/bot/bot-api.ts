import { Type } from '@sinclair/typebox'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'

interface TelegramBotApiParams {
  token: string
  method: string
  payload?: Record<string, unknown>
}

export const telegramBotApiTool: Tool = {
  name: 'telegram_bot_api',
  description: 'Call any Telegram Bot API method directly using a bot token. Use for setting menu buttons, webhooks, commands, or any Bot API action. Example methods: setChatMenuButton, setMyCommands, sendMessage, getMe, setChatPhoto, deleteWebhook.',
  parameters: Type.Object({
    token: Type.String({ description: 'The bot token from BotFather (e.g. 123456:ABC-DEF...)' }),
    method: Type.String({ description: 'Telegram Bot API method name (e.g. setChatMenuButton, setMyCommands, sendMessage)' }),
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'JSON payload for the method (optional for GET-style methods like getMe)' })),
  }),
}

export const telegramBotApiExecutor: ToolExecutor<TelegramBotApiParams> = async (params): Promise<ToolResult> => {
  const { token, method, payload } = params

  if (!token || !token.includes(':')) {
    return { success: false, error: 'Invalid bot token format. Expected format: 123456:ABC-DEF...' }
  }
  if (!method) {
    return { success: false, error: 'method is required' }
  }

  const url = `https://api.telegram.org/bot${token}/${method}`

  try {
    const res = await fetch(url, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json' } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    })

    const data = await res.json() as { ok: boolean; result?: unknown; description?: string }

    if (!data.ok) {
      return { success: false, error: `Telegram API error: ${data.description ?? 'Unknown error'}` }
    }

    return { success: true, data: { result: data.result, method } }
  } catch (err) {
    return { success: false, error: `Failed to call Telegram Bot API: ${String(err)}` }
  }
}
