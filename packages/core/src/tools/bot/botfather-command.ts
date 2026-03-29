import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { Type } from '@sinclair/typebox'

interface BotFatherCommandParams {
  command: string
  followUp?: string[]
}

export const botFatherCommandTool: Tool = {
  name: 'botfather_command',
  description: 'Send a command to @BotFather and optionally provide follow-up responses. Use to configure a bot after creation — set description, about text, commands, profile photo, menu button web app URL, etc. Example commands: /setdescription, /setabouttext, /setcommands, /setmenubutton, /newapp, /mybots. The followUp array provides the answers to BotFather\'s prompts in order.',
  parameters: Type.Object({
    command: Type.String({ description: 'The BotFather command to send, e.g. "/setmenubutton" or "/setdescription"' }),
    followUp: Type.Optional(Type.Array(Type.String(), { description: 'Follow-up messages to send in sequence after the command (e.g. bot username, then the web app URL)' })),
  }),
}

export const botFatherCommandExecutor: ToolExecutor<BotFatherCommandParams> = async (params, context): Promise<ToolResult> => {
  const bridge = (context as Record<string, unknown>)['bridge'] as {
    getClient(): { getClient(): import('telegram').TelegramClient }
  } | undefined

  if (!bridge) return { success: false, error: 'No bridge available' }

  const { command, followUp = [] } = params

  try {
    const client = bridge.getClient().getClient()

    await client.sendMessage('BotFather' as never, { message: command })
    await new Promise(r => setTimeout(r, 2500))

    for (const msg of followUp) {
      await client.sendMessage('BotFather' as never, { message: msg })
      await new Promise(r => setTimeout(r, 2500))
    }

    const msgs = await client.getMessages('BotFather', { limit: 5 })
    const lastReply = msgs.find(m => !m.out)
    const replyText = lastReply?.message ?? ''

    return {
      success: true,
      data: {
        reply: replyText,
        command,
        followUpSent: followUp,
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
