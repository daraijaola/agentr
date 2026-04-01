import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { Type } from '@sinclair/typebox'

interface CreateBotParams {
  name: string
  username: string
}

export const createTelegramBotTool: Tool = {
  name: 'create_telegram_bot',
  description: 'Create a Telegram bot via BotFather. Handles full conversation, retries if username is taken.',
  parameters: Type.Object({
    name: Type.String({ description: 'Bot display name' }),
    username: Type.String({ description: 'Bot username (must end in bot)' }),
  }),
}

function normalizeBaseUsername(username: string): string {
  const cleaned = username
    .trim()
    .replace(/^@+/, '')
    .replace(/bot$/i, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
  return cleaned.slice(0, 24)
}

function isUsernameTakenError(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('already taken') || lower.includes('is taken') || lower.includes('occupied')
}

function isUsernameInvalidError(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('invalid') || lower.includes('must end in') || lower.includes('use latin letters')
}

export const createTelegramBotExecutor: ToolExecutor<CreateBotParams> = async (params, context): Promise<ToolResult> => {
  const bridge = (context as Record<string, unknown>)['bridge'] as {
    getClient(): { getClient(): import('telegram').TelegramClient }
  } | undefined

  if (!bridge) return { success: false, error: 'No bridge' }

  const { name, username } = params
  const baseUsername = normalizeBaseUsername(username)
  if (!baseUsername) return { success: false, error: 'Invalid username. Use letters, numbers, and underscores.' }

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = attempt === 0 ? '' : Math.floor(Math.random() * 9000 + 1000).toString()
    const candidateBase = `${baseUsername}${suffix}`.slice(0, 29)
    const finalUsername = `${candidateBase}bot`

    try {
      const client = bridge.getClient().getClient()

      await client.sendMessage('BotFather' as never, { message: '/newbot' })
      await new Promise(r => setTimeout(r, 2500))

      await client.sendMessage('BotFather' as never, { message: name })
      await new Promise(r => setTimeout(r, 2500))

      await client.sendMessage('BotFather' as never, { message: finalUsername })
      await new Promise(r => setTimeout(r, 3500))

      const msgs = await client.getMessages('BotFather', { limit: 12 })
      let token = ''
      let errorMsg = ''

      for (const msg of msgs) {
        if (msg.out) continue
        const text = msg.message ?? ''

        const match = text.match(/\d{8,12}:[A-Za-z0-9_-]{35,}/)
        if (match) {
          token = match[0]
          break
        }

        if (isUsernameTakenError(text) || isUsernameInvalidError(text)) {
          errorMsg = text
          break
        }
      }

      if (token) {
        return {
          success: true,
          data: {
            token,
            username: finalUsername,
            name,
            message: `Bot @${finalUsername} created. Token: ${token}`,
          },
        }
      }

      if (isUsernameTakenError(errorMsg) || isUsernameInvalidError(errorMsg)) {
        continue
      }

      return { success: false, error: `BotFather error: ${errorMsg || 'No token received'}` }
    } catch (err) {
      if (attempt === 4) return { success: false, error: String(err) }
    }
  }

  return { success: false, error: 'Failed after 5 username attempts' }
}
