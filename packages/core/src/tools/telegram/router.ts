/**
 * Hybrid Telegram router — v2
 *
 * telegram_mode classification:
 *   "bot"     — Standard messaging path. GramJS executes immediately, no jitter.
 *               Covers 70-80% of all traffic: sendMessage, editMessage, reactions,
 *               reply keyboards, pins, media, scheduled messages.
 *   "userbot" — GramJS-only capability. Applies 4-12 s jitter before every call.
 *               Required for: history, dialogs, search, stories, transcription.
 *   "hybrid"  — Everything else (group admin, profile, channels, gifts, etc.).
 *               No jitter; GramJS session errors surface as user-facing fallback.
 *
 * On any GramJS session/flood error:
 *   1. Health score is decremented.
 *   2. Error is logged with tenant context.
 *   3. User sees: "Advanced action temporarily limited for safety. Retrying basic mode."
 */

import { sessionManager } from '../../session/manager.js'

export type TelegramMode = 'bot' | 'userbot' | 'hybrid'

/**
 * Fast-path tools — standard chat messaging.
 * No jitter. ~70-80% of daily traffic goes through these.
 */
const BOT_MODE_TOOLS: ReadonlySet<string> = new Set([
  'telegram_send_message',
  'telegram_edit_message',
  'telegram_delete_message',
  'telegram_forward_message',
  'telegram_quote_reply',
  'telegram_react',
  'telegram_reply_keyboard',
  'telegram_pin_message',
  'telegram_unpin_message',
  'telegram_send_photo',
  'telegram_send_gif',
  'telegram_send_sticker',
  'telegram_send_voice',
  'telegram_send_dice',
  'telegram_mark_as_read',
  'telegram_schedule_message',
  'telegram_send_scheduled_now',
  'telegram_delete_scheduled_message',
  'telegram_get_scheduled_messages',
  'telegram_create_poll',
  'telegram_create_quiz',
  'telegram_get_me',
  'telegram_get_user_info',
  'telegram_get_chat_info',
])

/**
 * GramJS-only tools — require userbot session capabilities.
 * Jitter applied before each call to reduce behavioural fingerprinting.
 */
const USERBOT_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'telegram_get_history',
  'telegram_get_dialogs',
  'telegram_search_messages',
  'telegram_get_replies',
  'telegram_download_media',
  'telegram_transcribe_audio',
  'telegram_send_story',
])

export function getTelegramMode(toolName: string): TelegramMode {
  if (!toolName.startsWith('telegram_')) return 'bot'
  if (BOT_MODE_TOOLS.has(toolName)) return 'bot'
  if (USERBOT_ONLY_TOOLS.has(toolName)) return 'userbot'
  return 'hybrid'
}

export async function routedExecute<T>(
  toolName: string,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const isTelegram = toolName.startsWith('telegram_')
  const mode = getTelegramMode(toolName)

  // Rate-limit Telegram actions (workspace / TON / memory tools are exempt)
  if (isTelegram && !sessionManager.checkRateLimit(tenantId)) {
    throw new Error('Rate limit reached (10 Telegram actions/min). Please wait a moment.')
  }

  // Jitter only for GramJS userbot-only tools
  if (mode === 'userbot') {
    await sessionManager.jitter()
  }

  try {
    const result = await fn()
    if (isTelegram) sessionManager.recordSuccess(tenantId)
    return result
  } catch (err) {
    if (isTelegram) sessionManager.recordFailure(tenantId)

    const msg = String(err)
    const isSessionError =
      msg.includes('FloodWait') ||
      msg.includes('AUTH_KEY') ||
      msg.includes('SESSION') ||
      msg.includes('FLOOD') ||
      msg.includes('NetworkError') ||
      msg.includes('TIMEOUT') ||
      msg.includes('freeze')

    if (isSessionError) {
      const score = sessionManager.getHealthScore(tenantId)
      console.error(
        `[TelegramRouter] Session error on ${toolName} tenant=${tenantId} score=${score}: ${msg}`
      )
      throw new Error(
        'Advanced action temporarily limited for safety. Retrying basic mode.',
      )
    }

    throw err
  }
}
