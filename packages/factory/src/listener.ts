import type { AgentRuntime } from '@agentr/core'
import type { TelegramUserClient } from '@agentr/core'
import type { NewMessageEvent } from 'telegram/events/NewMessage.js'

const TYPING_DELAY_MS = 500
const processingMessages = new Set<string>()

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

        const senderId = msg.senderId?.toString() ?? ""
        if (senderId === me?.id?.toString()) return

        const msgKey = String(msg.chatId) + '-' + String(msg.id)
        if (processingMessages.has(msgKey)) return
        processingMessages.add(msgKey)
        setTimeout(() => processingMessages.delete(msgKey), 30000)

        const isPrivate = msg.peerId && 'userId' in msg.peerId
        if (!isPrivate) return

        // Ignore BotFather and all bots - HARD BLOCK
        const IGNORED_BOTS = ['93372553', '1087968824', '136817688']  // BotFather etc
        
        if (IGNORED_BOTS.includes(senderId)) {
          console.log('[Listener:' + tenantId + '] Blocked bot: ' + senderId)
          return
        }

        const senderEntity = await msg.getSender()
        if (senderEntity && 'bot' in senderEntity && (senderEntity as {bot?: boolean}).bot === true) {
          console.log('[Listener:' + tenantId + '] Blocked bot entity: ' + senderId)
          return
        }

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
        console.log('[Listener:' + tenantId + '] From ' + (userName ?? senderId) + ': ' + msg.message.slice(0, 80))

        try { await client.setTyping(chatId) } catch {}
        await new Promise(r => setTimeout(r, TYPING_DELAY_MS))

        const response = await runtime.processMessage({
          chatId,
          userMessage: msg.message,
          userName,
          messageId: msg.id,
        })

        if (!response.content) return

        // Split long messages — Telegram limit is 4096 chars
        const MAX_TG = 4000
        const content = response.content
        if (content.length <= MAX_TG) {
          await client.sendMessage(chatId, content, { replyTo: msg.id })
        } else {
          const chunks: string[] = []
          let remaining = content
          while (remaining.length > 0) {
            // Try to split at newline near the limit
            let cut = MAX_TG
            if (remaining.length > MAX_TG) {
              const nl = remaining.lastIndexOf('\n', MAX_TG)
              cut = nl > MAX_TG / 2 ? nl : MAX_TG
            }
            chunks.push(remaining.slice(0, cut))
            remaining = remaining.slice(cut)
          }
          for (let i = 0; i < chunks.length; i++) {
            await client.sendMessage(chatId, chunks[i], i === 0 ? { replyTo: msg.id } : undefined)
            if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500))
          }
        }
        console.log('[Listener:' + tenantId + '] Replied: ' + response.content.slice(0, 80))
      } catch (err) {
        console.error('[Listener:' + tenantId + '] Error:', err)
      }
    },
    { incoming: true }
  )

  console.log('[Listener:' + tenantId + '] Attached')
}
