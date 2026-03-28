import type { AgentRuntime } from '@agentr/core'
import { MessageDebouncer } from './debouncer.js'
import type { TelegramUserClient } from '@agentr/core'
import { agentFactory } from './factory.js'
// @ts-expect-error — gramjs NewMessage types not exported
import type { NewMessageEvent } from 'telegram/events/NewMessage.js'

const TYPING_DELAY_MS = 500
const processingMessages = new Set<string>()

// Per-client contact-ID cache with a 5-minute TTL to avoid repeated API calls
const contactCache = new Map<string, { ids: Set<string>; expiresAt: number }>()

async function isInContacts(client: TelegramUserClient, tenantId: string, senderId: string): Promise<boolean> {
  const now = Date.now()
  const cached = contactCache.get(tenantId)
  if (cached && cached.expiresAt > now) return cached.ids.has(senderId)
  try {
    const contacts: Array<{ id?: { toString(): string } }> = await (client as any).getContacts?.() ?? []
    const ids = new Set(contacts.map(c => c.id?.toString() ?? '').filter(Boolean))
    contactCache.set(tenantId, { ids, expiresAt: now + 5 * 60_000 })
    return ids.has(senderId)
  } catch {
    // If we can't fetch contacts, fail closed (reject the message)
    return false
  }
}

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
    // Immediate ack for complex tasks
    const isComplex = combined.length > 20 && /create|build|deploy|write|make|run|install|set up|webpage|bot/i.test(combined)
    if (isComplex) {
      try { await tgClient.sendMessage(chatId, '⚙️ On it! Give me a moment...') } catch {}
    }
    const response = await runtime.processMessage({ chatId, userMessage: combined, userName, messageId: replyToId })
    if (!response.content) return

    // Absolute last-resort guard — strip code/HTML/JSON before it reaches Telegram
    let text = response.content

    // Preserve any https:// URLs before stripping — they are the proof of completion
    const urlMatches = text.match(/https?:\/\/[^\s"'<>)]+/g) ?? []

    text = text.replace(/```[\s\S]*?```/g, '').trim()
    text = text.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim()
    text = text.replace(/<tool_calls?[^>]*>[\s\S]*?<\/tool_calls?>/g, '').trim()
    text = text.replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/g, '').trim()
    text = text.replace(/<tool_result[^>]*>[\s\S]*?<\/tool_result>/g, '').trim()
    // Strip Python-style leaked tool calls: ton_send({...})
    text = text.replace(/\b[a-z][a-z0-9_]*\s*\(\s*\{[\s\S]*?\}\s*\)/g, '').trim()
    // Strip raw JSON blobs (tool result echoes — e.g. {"success":true,...})
    text = text.replace(/^\{[^]*?\}\s*\n?/gm, (m) => {
      try { JSON.parse(m.trim()); return '' } catch { return m }
    }).trim()
    const tagCount = (text.match(/</g) ?? []).length
    if (tagCount > 8 && text.length > 300) {
      const safe = text.split('\n').find(l => l.trim().length > 5 && !l.includes('<') && !l.includes('{') && !l.includes('@import'))
      text = safe ?? ''
    }

    // If stripping gutted the message but we had URLs, restore them as the reply
    if ((!text || !text.trim()) && urlMatches.length > 0) {
      text = urlMatches.join('\n')
    }
    text = text.trim()
    if (!text) text = 'Done! ✅'
    if (!text.trim()) return   // absolute guard — never send empty to Telegram

    // Telegram max is 4096 but keep it shorter for readability
    const MAX_TG = 3800
    if (text.length <= MAX_TG) {
      await tgClient.sendMessage(chatId, text, { replyTo: replyToId })
    } else {
      // Hard cap — never send more than 2 chunks; if still too long, trim
      const trimmed = text.slice(0, MAX_TG * 2)
      const chunks: string[] = []
      let rem = trimmed
      while (rem.length > 0) {
        const nl = rem.lastIndexOf('\n', MAX_TG)
        const cut = nl > MAX_TG / 2 ? nl : MAX_TG
        chunks.push(rem.slice(0, cut)); rem = rem.slice(cut)
      }
      for (let i = 0; i < Math.min(chunks.length, 2); i++) {
        await tgClient.sendMessage(chatId, chunks[i]!, i === 0 ? { replyTo: replyToId } : undefined)
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
            const tenant = await agentFactory.getDb().getTenant(tenantId)
            const policy = tenant?.dm_policy ?? 'contacts'
            if (policy === 'manual') {
              // Get sender's username from the message sender
              const senderUsername = (msg.sender as any)?.username?.toLowerCase()?.replace('@','')
              const ownerUsername = tenant?.owner_username?.toLowerCase()?.replace('@','')
              if (!ownerUsername || !senderUsername || senderUsername !== ownerUsername) return
            }
            if (policy === 'contacts') {
              const msgSenderId = (msg.peerId as any).userId?.toString()
              const ownerId = tenant?.telegram_user_id?.toString()
              if (msgSenderId && ownerId && msgSenderId !== ownerId) {
                const contact = await isInContacts(client, tenantId, msgSenderId)
                if (!contact) return
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
