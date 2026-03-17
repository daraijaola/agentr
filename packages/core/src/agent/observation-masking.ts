const KEEP_RECENT = 6
const TRUNCATE_THRESHOLD = 3000
const TRUNCATE_KEEP = 500

function truncateResult(text: string): string {
  try {
    const parsed = JSON.parse(text)
    if (parsed.data?.summary) return JSON.stringify({ success: parsed.success, data: { summary: parsed.data.summary, _truncated: true } })
    if (parsed.data?.message) return JSON.stringify({ success: parsed.success, data: { message: parsed.data.message, _truncated: true } })
  } catch {}
  return text.slice(0, TRUNCATE_KEEP) + `\n...[truncated, ${text.length} chars total]`
}

export function maskOldToolResults(messages: any[]): any[] {
  const toolIdx: number[] = []
  messages.forEach((m, i) => { if (m.role === 'tool') toolIdx.push(i) })
  if (toolIdx.length <= KEEP_RECENT) return messages
  const result = [...messages]
  for (const idx of toolIdx.slice(0, -KEEP_RECENT)) {
    const msg = result[idx]
    if (!msg) continue
    const toolName = msg.name ?? msg.toolName ?? 'tool'
    result[idx] = { ...msg, content: `[Tool: ${toolName} - OK]` }
  }
  for (const idx of toolIdx.slice(-KEEP_RECENT)) {
    const msg = result[idx]
    if (!msg) continue
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    if (text.length > TRUNCATE_THRESHOLD) result[idx] = { ...msg, content: truncateResult(text) }
  }
  return result
}
