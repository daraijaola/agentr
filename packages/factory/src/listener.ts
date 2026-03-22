import type { AgentRuntime } from '@agentr/core'
import { MessageDebouncer } from './debouncer.js'
import type { TelegramUserClient } from '@agentr/core'
// @ts-ignore
// @ts-ignore
import type { NewMessageEvent } from 'telegram/events/NewMessage.js'

const TYPING_DELAY_MS = 500
const processingMessages = new Set<string>()

export function attachMessageListener(
  tenantId: string,
  client: TelegramUserClient,
  runtime: AgentRuntime
): void {
  const me = client.getMe()

  // Message debouncer — batches rapid messages, sends typing indicator
  const debouncer = new MessageDebouncer(700, async (chatId, messages, replyToId, userName, tgClient) => {
    const combined = messages.join('\n')
    try { await tgClient.setTyping(chatId) } catch {}
    await new Promise(r => setTimeout(r, TYPING_DELAY_MS))
    const response = await runtime.processMessage({ chatId, userMessage: combined, userName, messageId: replyToId })
    if (!response.content) return
    const MAX_TG = 4000
    const text = response.content
    if (text.length <= MAX_TG) {
      await tgClient.sendMessage(chatId, text, { replyTo: replyToId })
    } else {
      const chunks: string[] = []
      let rem = text
      while (rem.length > 0) {
        let cut = MAX_TG
        if (rem.length > MAX_TG) { const nl = rem.lastIndexOf('\n', MAX_TG); cut = nl > MAX_TG / 2 ? nl : MAX_TG }
        chunks.push(rem.slice(0, cut)); rem = rem.slice(cut)
      }
      for (let i = 0; i < chunks.length; i++) {
        await tgClient.sendMessage(chatId, chunks[i], i === 0 ? { replyTo: replyToId } : undefined)
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500))
      }
    }
    console.log('[Listener:' + tenantId + '] Replied: ' + response.content.slice(0, 80))
  })


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

        // DM policy filter
        if (isPrivate) {
          try {
            const tenant = await this.db.getTenant(tenantId)
            const policy = tenant?.dm_policy ?? 'contacts'
            if (policy === 'manual') {
              // Get sender's username from the message sender
              const senderUsername = (msg.sender as any)?.username?.toLowerCase()?.replace('@','')
              const ownerUsername = tenant?.owner_username?.toLowerCase()?.replace('@','')
              if (!ownerUsername || !senderUsername || senderUsername !== ownerUsername) return
            }
            if (policy === 'contacts') {
              // Only process if sender is in contacts
              // We check by comparing senderId to known contacts
              // For now allow owner's own messages + known senders
              const senderId = (msg.peerId as any).userId?.toString()
              const ownerId = tenant?.telegram_user_id?.toString()
              if (senderId && ownerId && senderId !== ownerId) {
                // Check if sender is a contact via get_contacts tool would be expensive
                // Simple approach: allow all for now but skip bot messages
                const isBot = msg.viaBotId != null
                if (isBot) return
              }
            }
            // policy === 'everyone' — allow all
          } catch { /* non-blocking, allow through */ }
        }
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

        // Admin commands — owner only
        if (msg.message.startsWith('/')) {
          const cmd = msg.message.trim().toLowerCase().split(' ')[0]
          let reply: string | null = null

          if (cmd === '/ping') {
            reply = '🏓 Pong!'
          } else if (cmd === '/status') {
            reply = `🤖 AGENTR Status\n\n✅ Agent: Online\n📱 Account: ${tenantId.slice(0,8)}...\n🧠 Model: ${process.env.LLM_MODEL ?? 'unknown'}\n📬 Runtime: PM2 managed`
          } else if (cmd === '/clear') {
            runtime.clearHistory(chatId)
            reply = '🗑️ Conversation history cleared.'
          } else if (cmd === '/help') {
            reply = '🤖 AGENTR Commands\n\n/ping — Check if agent is alive\n/status — View agent status\n/clear — Clear conversation history\n/help — Show this message'
          }

          if (reply) {
            await client.sendMessage(chatId, reply, { replyTo: msg.id })
            return
          }
        }

        // Debounce — batch rapid messages before processing
        await debouncer.enqueue(chatId, msg.message, senderId, msg.id, userName, client)
      } catch (err) {
        console.error('[Listener:' + tenantId + '] Error:', err)
      }
    },
    { incoming: true }
  )

  console.log('[Listener:' + tenantId + '] Attached')
}
