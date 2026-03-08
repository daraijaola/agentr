import type { AgentRuntime } from '@agentr/core'
import type { TelegramUserClient } from '@agentr/core'
import type { NewMessageEvent } from 'telegram/events/NewMessage.js'

const TYPING_DELAY_MS = 500

export function attachMessageListener(
  tenantId: string,
  client: TelegramUserClient,
  runtime: AgentRuntime
): void {
  const me = client.getMe()

  client.onMessage(
    async (event: NewMessageEvent) => {
      try {
        const msg = event.message
        if (!msg?.message) return

        const senderId = msg.senderId?.toString()
        if (senderId === me?.id?.toString()) return

        // Only respond to private DMs
        const isPrivate = msg.peerId && 'userId' in msg.peerId
        if (!isPrivate) return

        const chat = await msg.getChat()
        const sender = await msg.getSender()
        const chatEntity = chat ?? sender
        if (!chatEntity) return

        let userName: string | undefined
        if (sender && ('firstName' in sender || 'username' in sender)) {
          const s = sender as { firstName?: string; username?: string }
          userName = s.firstName ?? s.username ?? undefined
        }

        const chatId = msg.chatId?.toString() ?? tenantId
        console.log(`[Listener:${tenantId}] From ${userName ?? senderId}: ${msg.message.slice(0, 80)}`)

        try { await client.setTyping(chatId) } catch {}
        await new Promise(r => setTimeout(r, TYPING_DELAY_MS))

        const response = await runtime.processMessage({
          chatId,
          userMessage: msg.message,
          userName,
          messageId: msg.id,
        })

        if (!response.content) return

        await client.sendMessage(chatId, response.content, { replyTo: msg.id })
        console.log(`[Listener:${tenantId}] Replied: ${response.content.slice(0, 80)}`)
      } catch (err) {
        console.error(`[Listener:${tenantId}] Error:`, err)
      }
    },
    { incoming: true }
  )

  console.log(`[Listener:${tenantId}] Attached ✓`)
}
