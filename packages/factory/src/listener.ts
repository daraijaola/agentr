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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function groupMessageAddressesAgent(
  text: string,
  me?: { username?: string; id?: { toString(): string } | bigint | number | string },
  message?: { mentioned?: boolean },
  isReplyToAgent = false
): boolean {
  if (message?.mentioned === true || isReplyToAgent) return true
  const username = me?.username?.replace(/^@/, '').trim()
  const aliases = [
    username,
    'agentr',
    'agent r',
    'the agent',
    'zion',
  ].filter((v): v is string => Boolean(v))
  return aliases.some(alias => {
    const atMention = new RegExp(`(^|[^a-zA-Z0-9_])@${escapeRegExp(alias.replace(/\s+/g, ''))}(?=$|[^a-zA-Z0-9_])`, 'i')
    const naturalPrompt = new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(alias)}(?=\\s*(?:[,.:;!?]|\\b))`, 'i')
    return atMention.test(text) || naturalPrompt.test(text)
  })
}

function senderLooksLikeBot(sender: unknown): boolean {
  if (!sender || typeof sender !== 'object') return false
  const s = sender as { bot?: boolean; username?: string }
  if (s.bot === true) return true
  const username = s.username?.replace(/^@/, '').toLowerCase()
  return Boolean(username && username.endsWith('bot'))
}

export function formatSenderIdentity(sender: unknown, senderId: string): string | undefined {
  if (!sender || typeof sender !== 'object') return senderId || undefined
  const s = sender as { firstName?: string; lastName?: string; username?: string }
  const name = [s.firstName, s.lastName].filter(Boolean).join(' ').trim()
  const username = s.username ? `@${s.username.replace(/^@/, '')}` : ''
  const details = [username, senderId ? `Telegram ID: ${senderId}` : ''].filter(Boolean).join(', ')
  if (name && details) return `${name} (${details})`
  if (name) return name
  if (details) return details
  return senderId || undefined
}

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

async function isReplyToAgentMessage(
  client: TelegramUserClient,
  chatId: string,
  replyToMsgId: number | undefined,
  me?: { id?: { toString(): string } | bigint | number | string }
): Promise<boolean> {
  if (!replyToMsgId || !me?.id) return false
  try {
    const raw = (client as any).getClient?.()
    const result = await raw?.getMessages(chatId as never, { ids: replyToMsgId })
    const replied = Array.isArray(result) ? result[0] : result
    return replied?.senderId?.toString?.() === me.id.toString()
  } catch {
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
  const debouncer = new MessageDebouncer(700, async (chatId, messages, replyToId, userName, tgClient, isGroup) => {
    const combined = messages.join('\n')
    try { await tgClient.setTyping(chatId) } catch {}
    await new Promise(r => setTimeout(r, TYPING_DELAY_MS))

    const response = await runtime.processMessage({ chatId, userMessage: combined, userName, isGroup, messageId: replyToId })
    if (!response.content) return
    if (/still working on your previous request|please wait a moment/i.test(response.content)) {
      console.log('[Listener:' + tenantId + '] Suppressed busy reply for chat ' + chatId)
      return
    }

    // Absolute last-resort guard — strip code/HTML/JSON before it reaches Telegram
    let text = response.content

    // Preserve any https:// URLs before stripping — they are the proof of completion
    const urlMatches = text.match(/https?:\/\/[^\s"'<>)]+/g) ?? []

    text = text.replace(/```[\s\S]*?```/g, '').trim()
    text = text.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim()
    text = text.replace(/<tool_calls?[^>]*>[\s\S]*?<\/tool_calls?>/gi, '').trim()
    text = text.replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/gi, '').trim()
    text = text.replace(/<tool_use[^>]*>[\s\S]*?<\/tool_use>/gi, '').trim()
    text = text.replace(/<tool_result[^>]*>[\s\S]*?<\/tool_result>/gi, '').trim()
    // Strip leaked tool narration: [calling: tool_name with {...}]
    text = text.replace(/\[calling:[^\]]+\]/gi, '').trim()
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
    // Strip invisible/zero-width chars that fool .trim() but Telegram rejects as empty
    const visibleText = text.replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, '').trim()
    if (!visibleText) text = 'Done ✅'
    else text = visibleText

    // Telegram max is 4096 but keep it shorter for readability
    const MAX_TG = 3800

    const safeSend = async (msg: string, opts?: { replyTo?: number }) => {
      const clean = (msg ?? '').trim()
      if (!clean) return  // never send empty
      try {
        await tgClient.sendMessage(chatId, clean, opts)
      } catch (e) {
        const err = String(e)
        if (err.includes('empty') || err.includes('EMPTY')) {
          // Fallback — send a minimal confirmation if all else fails
          try { await tgClient.sendMessage(chatId, 'Done ✅') } catch {}
        } else {
          throw e
        }
      }
    }

    if (text.length <= MAX_TG) {
      await safeSend(text, { replyTo: replyToId })
    } else {
      // Hard cap — never send more than 2 chunks; if still too long, trim
      const trimmed = text.slice(0, MAX_TG * 2)
      const chunks: string[] = []
      let rem = trimmed
      while (rem.length > 0) {
        const nl = rem.lastIndexOf('\n', MAX_TG)
        const cut = nl > MAX_TG / 2 ? nl : MAX_TG
        const chunk = rem.slice(0, cut).trim()
        if (chunk) chunks.push(chunk)
        rem = rem.slice(cut)
      }
      for (let i = 0; i < Math.min(chunks.length, 2); i++) {
        await safeSend(chunks[i]!, i === 0 ? { replyTo: replyToId } : undefined)
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

        // Ignore BotFather and all bots before any group/reply routing.
        // This prevents bot-to-bot loops when another bot replies to the agent.
        const IGNORED_BOTS = ['93372553', '1087968824', '136817688']  // BotFather etc
        if (IGNORED_BOTS.includes(senderId)) {
          console.log('[Listener:' + tenantId + '] Blocked bot: ' + senderId)
          return
        }
        const senderEntity = await msg.getSender()
        if (senderLooksLikeBot(senderEntity)) {
          console.log('[Listener:' + tenantId + '] Blocked bot entity: ' + senderId)
          return
        }

        const msgKey = String(msg.chatId) + '-' + String(msg.id)
        if (processingMessages.has(msgKey)) return
        processingMessages.add(msgKey)
        setTimeout(() => processingMessages.delete(msgKey), 30000)

        const isPrivate = Boolean(msg.peerId && 'userId' in msg.peerId)
        const isGroup = !isPrivate
        const chatId = msg.chatId?.toString() ?? tenantId

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
        if (isGroup) {
          const replyToMsgId = (msg.replyTo as { replyToMsgId?: number } | undefined)?.replyToMsgId
          const isReplyToAgent = await isReplyToAgentMessage(client, chatId, replyToMsgId, me)
          if (!groupMessageAddressesAgent(msg.message, me, msg as { mentioned?: boolean }, isReplyToAgent)) return
        }

        const chat = await msg.getChat()
        const sender = senderEntity
        const chatEntity = chat ?? sender
        if (!chatEntity) return

        let userName: string | undefined
        if (sender) userName = formatSenderIdentity(sender, senderId)

        console.log('[Listener:' + tenantId + '] From ' + (userName ?? senderId) + ': ' + msg.message.slice(0, 80))

        // Admin commands — owner only
        if (msg.message.startsWith('/')) {
          const cmd = msg.message.trim().toLowerCase().split(' ')[0]
          let reply: string | null = null

          if (cmd === '/ping') {
            reply = '🏓 Pong!'
          } else if (cmd === '/status') {
            const _mid = runtime.getModel()
            const _mnames: Record<string,string> = {
              'claude-haiku-4-5':'Claude Haiku 4.5','gpt-5-nano':'GPT-5 nano',
              'gpt-4o-mini':'GPT-4o mini','gpt-5-mini':'GPT-5 mini',
              'gpt-5.4':'GPT-5.4','claude-opus-4-8':'Claude Opus 4.8',
            }
            const _mname = _mnames[_mid] ?? _mid
            reply = `🤖 AGENTR Status\n\n✅ Agent: Online\n📱 Account: ${tenantId.slice(0,8)}...\n🧠 Model: ${_mname}\n📬 Runtime: PM2 managed`
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
        await debouncer.enqueue(chatId, msg.message, senderId, msg.id, userName, client, isGroup)
      } catch (err) {
        console.error('[Listener:' + tenantId + '] Error:', err)
      }
    },
    { incoming: true }
  )

  console.log('[Listener:' + tenantId + '] Attached')
}
