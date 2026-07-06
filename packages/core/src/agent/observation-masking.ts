import { MASKING_KEEP_RECENT_COUNT, RESULT_TRUNCATION_THRESHOLD, RESULT_TRUNCATION_KEEP_CHARS } from '../constants/limits.js'

const DATA_BEARING_TOOLS = new Set([
  'workspace_read', 'workspace_list', 'workspace_info',
  'ton_get_balance', 'ton_get_transactions', 'get_dialogs',
  'get_history', 'search_messages', 'get_chat_info',
  'telegram_get_stars_balance', 'telegram_get_stars_transactions',
])

function isExempt(toolName: string, content: string): boolean {
  if (DATA_BEARING_TOOLS.has(toolName)) return true
  try {
    const parsed = JSON.parse(content)
    if (parsed.success === false) return true
  } catch {}
  return false
}

function truncateResult(text: string): string {
  try {
    const parsed = JSON.parse(text)
    if (parsed.data?.summary) return JSON.stringify({ success: parsed.success, data: { summary: parsed.data.summary, _truncated: true } })
    if (parsed.data?.message) return JSON.stringify({ success: parsed.success, data: { summary: parsed.data.message, _truncated: true } })
    if (parsed.data?.stdout !== undefined) {
      const stdout = String(parsed.data.stdout ?? '').slice(0, RESULT_TRUNCATION_KEEP_CHARS)
      return JSON.stringify({ success: parsed.success, data: { stdout, stderr: String(parsed.data.stderr ?? '').slice(0, 200), _truncated: true } })
    }
  } catch {}
  return text.slice(0, RESULT_TRUNCATION_KEEP_CHARS) + `\n...[truncated, ${text.length} chars total]`
}

export function maskOldToolResults(messages: any[]): any[] {
  const toolIdx: number[] = []
  messages.forEach((m, i) => { if (m.role === 'tool') toolIdx.push(i) })
  if (toolIdx.length <= MASKING_KEEP_RECENT_COUNT) return messages
  const result = [...messages]
  for (const idx of toolIdx.slice(0, -MASKING_KEEP_RECENT_COUNT)) {
    const msg = result[idx]
    if (!msg) continue
    const toolName = msg.name ?? msg.toolName ?? 'tool'
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    if (isExempt(toolName, content)) continue
    result[idx] = { ...msg, content: `[Tool: ${toolName} - OK]` }
  }
  for (const idx of toolIdx.slice(-MASKING_KEEP_RECENT_COUNT)) {
    const msg = result[idx]
    if (!msg) continue
    const toolName = msg.name ?? msg.toolName ?? 'tool'
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    if (isExempt(toolName, text)) continue
    if (text.length > RESULT_TRUNCATION_THRESHOLD) result[idx] = { ...msg, content: truncateResult(text) }
  }
  return result
}
