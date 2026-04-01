/**
 * Hybrid Telegram router.
 *
 * telegram_mode values:
 *   "bot"     — Bot API equivalent (GramJS sendMessage / editMessage / reactions).
 *               Fast path; minimal jitter needed.
 *   "userbot" — GramJS-only capability (join private groups, search history, secret chats).
 *               Applies 4-12 s jitter before every call.
 *   "hybrid"  — Can use either; tries GramJS and falls back gracefully.
 *
 * On any GramJS session/flood error the router:
 *   1. Logs the failure and updates the health score.
 *   2. Re-throws an error whose message the agent can relay to the user:
 *      "Advanced action temporarily limited for safety. Retrying basic mode."
 */

import { sessionManager } from '../../session/manager.js'

export type TelegramMode = 'bot' | 'userbot' | 'hybrid'

/** Tools that MUST go through GramJS (no Bot API equivalent). */
const USERBOT_ONLY: ReadonlySet<string> = new Set([
  'telegram_get_messages',
  'telegram_search_messages',
  'telegram_join_group',
  'telegram_get_dialogs',
])

export function getTelegramMode(toolName: string): TelegramMode {
  if (!toolName.startsWith('telegram_')) return 'bot'
  if (USERBOT_ONLY.has(toolName)) return 'userbot'
  return 'hybrid'
}

export async function routedExecute<T>(
  toolName: string,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const isTelegram = toolName.startsWith('telegram_')
  const mode = getTelegramMode(toolName)

  // Rate-limit only Telegram actions (workspace / TON tools are exempt)
  if (isTelegram && !sessionManager.checkRateLimit(tenantId)) {
    throw new Error('Rate limit reached (10 Telegram actions/min). Please wait a moment.')
  }

  // Jitter for userbot-only tools (reduces behavioural fingerprinting)
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
      console.error(`[TelegramRouter] Session error on ${toolName} for ${tenantId}: ${msg}`)
      throw new Error(
        'Advanced action temporarily limited for safety. Retrying basic mode.',
      )
    }

    throw err
  }
}
