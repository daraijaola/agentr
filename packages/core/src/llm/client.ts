// AIR LLM client — sole provider for AGENTR

export type LLMProvider = 'air'

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
  plan?: 'starter' | 'pro' | 'ultra' | 'elite' | 'enterprise'
  provisionedAt?: number // Unix ms — for starter 24h expiry check
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_call_id?: string
  name?: string
  tool_calls?: ToolCallRaw[]
}
export interface ToolCallRaw { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatOptions {
  systemPrompt?: string
  messages: ChatMessage[]
  tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
}
export interface ChatResponse {
  text: string
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  messages: ChatMessage[]
}

// All 10 AIR models
const AIR_MODELS = {
  // Fast / entry-tier
  HAIKU:   'claude-haiku-4-5',
  GPT4O_MINI: 'gpt-4o-mini',
  FLASH:   'gemini-2.5-flash',
  GPT5_MINI: 'gpt-5-mini',
  // Mid-tier
  SONNET:  'claude-sonnet-4-6',
  GPT4O:   'gpt-4o',
  PRO:     'gemini-2.5-pro',
  // Top-tier
  OPUS:    'claude-opus-4-6',
  GPT5:    'gpt-5.2',
  PRO_PREV: 'gemini-3.1-pro-preview',
} as const

// Plan model splits
const PLAN_MODELS: Record<string, string[]> = {
  starter:    [AIR_MODELS.HAIKU, AIR_MODELS.FLASH_LITE],
  pro:        [AIR_MODELS.HAIKU, AIR_MODELS.SONNET, AIR_MODELS.SONNET_LATEST, AIR_MODELS.FLASH, AIR_MODELS.FLASH_LITE, AIR_MODELS.GPT4O_MINI],
  ultra:      [AIR_MODELS.HAIKU, AIR_MODELS.SONNET, AIR_MODELS.SONNET_LATEST, AIR_MODELS.FLASH, AIR_MODELS.FLASH_LITE, AIR_MODELS.GPT4O_MINI, AIR_MODELS.GPT4O, AIR_MODELS.O4_MINI, AIR_MODELS.PRO_PREV],
  elite:      Object.values(AIR_MODELS),
  enterprise: Object.values(AIR_MODELS),
}

// Default model per plan
const PLAN_DEFAULTS: Record<string, string> = {
  starter:    AIR_MODELS.HAIKU,
  pro:        AIR_MODELS.SONNET,
  ultra:      AIR_MODELS.SONNET_LATEST,
  elite:      AIR_MODELS.OPUS,
  enterprise: AIR_MODELS.OPUS,
}

const STARTER_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const MAX_INPUT_BYTES = 100 * 1024           // 100 KB

function checkPlanAccess(config: LLMConfig, model: string): void {
  const plan = config.plan ?? 'starter'

  // Starter plan: 24h TTL
  if (plan === 'starter') {
    const provisionedAt = config.provisionedAt ?? Date.now()
    if (Date.now() - provisionedAt > STARTER_TTL_MS) {
      throw new Error(
        'Your free trial has expired (24-hour limit). Please upgrade to Pro to continue using your AI agent.'
      )
    }
  }

  const allowed = PLAN_MODELS[plan] ?? PLAN_MODELS['starter']!
  if (!allowed.includes(model)) {
    throw new Error(
      `Model "${model}" is not available on the ${plan} plan. ` +
      `Available: ${allowed.join(', ')}. Upgrade to access more models.`
    )
  }
}

function messageBytes(messages: ChatMessage[]): number {
  return messages.reduce((acc, m) => acc + Buffer.byteLength(String(m.content ?? ''), 'utf8'), 0)
}

/** Trim message history to stay under MAX_INPUT_BYTES.
 *  Strategy (applied in order until size is acceptable):
 *  1. Compress ALL tool results to a short "[Tool: X - OK]" token
 *  2. Drop oldest non-system messages in chunks of 4 (one tool round-trip)
 *  Never drops the first system message or the last user message. */
function trimToFit(messages: ChatMessage[]): ChatMessage[] {
  let msgs = [...messages]

  // Pass 1: compress all tool results
  if (messageBytes(msgs) > MAX_INPUT_BYTES) {
    msgs = msgs.map(m => {
      if (m.role !== 'tool') return m
      try {
        const p = JSON.parse(String(m.content ?? ''))
        if (p.success === false) return m  // keep errors — model needs to see them
      } catch { /* not JSON */ }
      return { ...m, content: `[Tool: ${m.name ?? 'tool'} - OK]` }
    })
  }

  // Pass 2: drop oldest messages in chunks until we fit
  while (messageBytes(msgs) > MAX_INPUT_BYTES && msgs.length > 6) {
    // Find the first non-system message to drop (skip index 0 if it's system)
    const dropStart = msgs[0]?.role === 'system' ? 1 : 0
    msgs.splice(dropStart, Math.min(4, msgs.length - 4))
  }

  return msgs
}

/** Convert OpenAI-style message history to AIR-compatible format.
 *  AIR routes to Claude which rejects role:"tool" — flatten tool results into role:"user".
 *  IMPORTANT: Tool results are marked as INTERNAL_TOOL_RESULT so the LLM knows NOT to echo
 *  the raw JSON in its reply. The LLM must only reference results naturally. */
function toAirMessages(msgs: any[]): any[] {
  return msgs.reduce((acc: any[], m: any) => {
    if (m.role === 'tool') {
      // Parse result to give the LLM a clean summary rather than raw JSON
      let summary: string
      try {
        const parsed = JSON.parse(m.content ?? '{}') as { success?: boolean; data?: any; error?: string }
        if (parsed.success === false) {
          summary = `ERROR: ${parsed.error ?? 'Tool failed'}`
        } else {
          // Compact the data — stringify but strip wrapper
          const d = parsed.data
          summary = typeof d === 'string' ? d : JSON.stringify(d)
          if (summary.length > 600) summary = summary.slice(0, 600) + '...'
        }
      } catch {
        summary = String(m.content ?? '').slice(0, 600)
      }
      const toolText = `<tool_result tool="${m.name ?? 'unknown'}">\n${summary}\n</tool_result>`
      const prev = acc[acc.length - 1]
      if (prev?.role === 'user' && typeof prev.content === 'string') {
        prev.content += '\n\n' + toolText
      } else {
        acc.push({ role: 'user', content: toolText })
      }
      return acc
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const text = (m.content ?? '').trim()
      if (text) acc.push({ role: 'assistant', content: text })
      return acc
    }
    acc.push(m)
    return acc
  }, [])
}

/**
 * Recover as much as possible from a truncated JSON tool call.
 * For workspace_write: extracts `path` and salvages whatever `content` is available.
 * Returns a ToolCallRaw array (empty if nothing recoverable).
 */
function recoverTruncatedArgs(toolName: string, rawArgs: string): ToolCallRaw[] {
  if (!rawArgs.trim()) return []

  // First try: valid JSON as-is
  try {
    JSON.parse(rawArgs)
    return [{
      id: 'tc_rec_' + Math.random().toString(36).slice(2),
      type: 'function',
      function: { name: toolName, arguments: rawArgs },
    }]
  } catch { /* truncated — recover below */ }

  const partialArgs: Record<string, unknown> = {}

  // Extract "path" — almost always comes first and is complete
  const pathMatch = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(rawArgs)
  if (pathMatch) partialArgs['path'] = pathMatch[1]

  // For workspace_write: salvage the content field even if truncated
  if (toolName === 'workspace_write') {
    const contentStart = rawArgs.indexOf('"content"')
    if (contentStart !== -1) {
      // Find the opening quote of the content value
      const quoteIdx = rawArgs.indexOf('"', contentStart + 9)
      if (quoteIdx !== -1) {
        // Collect content until we hit an unescaped quote or end of string
        let content = ''
        let i = quoteIdx + 1
        while (i < rawArgs.length) {
          const ch = rawArgs[i]!
          if (ch === '\\' && i + 1 < rawArgs.length) {
            const next = rawArgs[i + 1]!
            if (next === 'n') { content += '\n'; i += 2; continue }
            if (next === '"') { content += '"'; i += 2; continue }
            if (next === '\\') { content += '\\'; i += 2; continue }
            if (next === 't') { content += '\t'; i += 2; continue }
            i += 2; continue
          }
          if (ch === '"') break  // end of content string
          content += ch
          i++
        }
        if (content.length > 100) {
          // Attempt to close HTML/JS properly so the file is valid
          if (/<html/i.test(content) && !/<\/html>/i.test(content)) {
            if (!/<\/body>/i.test(content)) content += '\n</body>'
            content += '\n</html>'
          }
          partialArgs['content'] = content
          // Mark truncated so runtime knows it's partial
          partialArgs['__salvaged'] = true
        }
      }
    }
    // If we have both path and content, we can actually execute this
    if (partialArgs['path'] && partialArgs['content']) {
      return [{
        id: 'tc_salvaged_' + Math.random().toString(36).slice(2),
        type: 'function',
        function: { name: toolName, arguments: JSON.stringify(partialArgs) },
      }]
    }
  }

  // For other tools: mark truncated so runtime sends the "write shorter" nudge
  if (partialArgs['path'] || Object.keys(partialArgs).length > 0) {
    partialArgs['__truncated'] = true
    return [{
      id: 'tc_trunc_' + Math.random().toString(36).slice(2),
      type: 'function',
      function: { name: toolName, arguments: JSON.stringify(partialArgs) },
    }]
  }

  // Nothing recoverable — return truncated marker so runtime nudges
  return [{
    id: 'tc_trunc_empty_' + Math.random().toString(36).slice(2),
    type: 'function',
    function: { name: toolName, arguments: JSON.stringify({ __truncated: true }) },
  }]
}

export class LLMClient {
  constructor(private config: LLMConfig) {}

  getProvider(): string { return 'air' }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const plan = this.config.plan ?? 'starter'
    const model = this.config.model ?? PLAN_DEFAULTS[plan] ?? AIR_MODELS.SONNET

    checkPlanAccess(this.config, model)

    // Build message list (system + history), strip reasoning_content artifacts
    // trimToFit compresses or drops old messages to stay under the 100 KB AIR limit
    const trimmedMessages = trimToFit(options.messages)
    const msgs: any[] = []
    if (options.systemPrompt) msgs.push({ role: 'system', content: options.systemPrompt })
    msgs.push(...trimmedMessages)
    const cleanMessages: any[] = msgs.map((m: any) => {
      const { reasoning_content, ...rest } = m
      void reasoning_content
      return rest
    })

    const airMessages = toAirMessages(cleanMessages)

    const apiKey = process.env['OPENAI_API_KEY'] ?? this.config.apiKey
    const baseUrl = process.env['AIR_BASE_URL']
    if (!baseUrl) throw new Error('AIR_BASE_URL environment variable is not set')

    const body: Record<string, unknown> = {
      model,
      max_tokens: this.config.maxTokens ?? 8192,
      temperature: this.config.temperature ?? 0.7,
      messages: airMessages,
    }

    if (options.tools?.length) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }))
      body.tool_choice = 'auto'
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`)

    const data = await res.json() as {
      choices: Array<{ message: { content: string | null; tool_calls?: ToolCallRaw[] } }>
    }
    const choice = data.choices[0]?.message
    let text = choice?.content ?? ''
    let rawTC: ToolCallRaw[] = choice?.tool_calls ?? []

    // Format 1a: <tool_call tool="name">{...}</tool_call> — attribute-style (model narrates with tool attr)
    // Also handles truncated blocks where closing tag is missing (response cut off mid-JSON)
    if (rawTC.length === 0 && /<tool_call\s+tool=/i.test(text)) {
      // Complete blocks
      const attrPattern = /<tool_call\s+tool="([^"]+)">\s*([\s\S]*?)\s*<\/tool_call>/gi
      let attrMatch
      while ((attrMatch = attrPattern.exec(text)) !== null) {
        const toolName = attrMatch[1]!.trim()
        const argsRaw = (attrMatch[2] ?? '').trim()
        try {
          const parsed = JSON.parse(argsRaw) as Record<string, unknown>
          rawTC.push({
            id: 'tc_attr_' + Math.random().toString(36).slice(2),
            type: 'function',
            function: { name: toolName, arguments: argsRaw },
          })
          void parsed
        } catch {
          // Truncated JSON inside complete-looking block — recover partial args
          rawTC.push(...recoverTruncatedArgs(toolName, argsRaw))
        }
      }
      // Truncated block — no closing tag (response cut off)
      if (rawTC.length === 0) {
        const truncMatch = /<tool_call\s+tool="([^"]+)">\s*([\s\S]*)$/i.exec(text)
        if (truncMatch) {
          const toolName = truncMatch[1]!.trim()
          const argsRaw = (truncMatch[2] ?? '').trim()
          rawTC.push(...recoverTruncatedArgs(toolName, argsRaw))
        }
      }
      if (rawTC.length > 0) text = text.replace(/<tool_call\s+tool="[^"]*">[\s\S]*/gi, '').trim()
    }

    // Format 1: <tool_call>{...}</tool_call> text tags
    if (rawTC.length === 0 && text.includes('<tool_call>')) {
      const tagPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g
      let match
      while ((match = tagPattern.exec(text)) !== null) {
        try {
          const parsed = JSON.parse(match[1]!) as { name?: string; arguments?: unknown }
          if (parsed.name) {
            rawTC.push({
              id: 'tc_' + Math.random().toString(36).slice(2),
              type: 'function',
              function: {
                name: parsed.name,
                arguments: typeof parsed.arguments === 'string'
                  ? parsed.arguments
                  : JSON.stringify(parsed.arguments ?? {}),
              },
            })
          }
        } catch { /* malformed — skip */ }
      }
      if (rawTC.length > 0) text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim()
    }

    // Format 2: <function_calls><invoke name="..."><parameter name="...">...</parameter></invoke></function_calls>
    if (rawTC.length === 0 && (text.includes('<function_calls>') || text.includes('<invoke '))) {
      const invokePattern = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g
      let match
      while ((match = invokePattern.exec(text)) !== null) {
        const toolName = match[1]!
        const body = match[2]!
        const paramPattern = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g
        const args: Record<string, string> = {}
        let p
        while ((p = paramPattern.exec(body)) !== null) args[p[1]!] = p[2]!.trim()
        rawTC.push({
          id: 'tc_' + Math.random().toString(36).slice(2),
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify(args) },
        })
      }
      if (rawTC.length > 0) text = text.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim()
    }

    // Format 3b: <tool_use>\ntool_name\n{json}\n</tool_use>
    // Anthropic XML tool use format — tool name on its own line after opening tag
    if (rawTC.length === 0 && text.includes('<tool_use>')) {
      // First try complete blocks
      const tuPattern = /<tool_use>\s*([a-z][a-z0-9_]*)\s*([\s\S]*?)\s*<\/tool_use>/gi
      let tuMatch
      while ((tuMatch = tuPattern.exec(text)) !== null) {
        const toolName = tuMatch[1]!.trim()
        const argsRaw = (tuMatch[2] ?? '').trim()
        try {
          const parsed = argsRaw.startsWith('{') ? JSON.parse(argsRaw) as Record<string, unknown> : {}
          rawTC.push({
            id: 'tc_tu_' + Math.random().toString(36).slice(2),
            type: 'function',
            function: { name: toolName, arguments: JSON.stringify(parsed) },
          })
        } catch {
          // Truncated JSON — try to recover partial args (at least path/name)
          const partialArgs: Record<string, unknown> = {}
          const pathM = /"path"\s*:\s*"([^"]*)"/.exec(argsRaw)
          if (pathM) partialArgs['path'] = pathM[1]
          const nameM = /"name"\s*:\s*"([^"]*)"/.exec(argsRaw)
          if (nameM) partialArgs['name'] = nameM[1]
          rawTC.push({
            id: 'tc_tu_' + Math.random().toString(36).slice(2),
            type: 'function',
            function: { name: toolName, arguments: JSON.stringify(partialArgs) },
          })
        }
      }
      // Fallback: incomplete block (response truncated before closing tag)
      if (rawTC.length === 0 && !text.includes('</tool_use>')) {
        const incompleteMatch = /<tool_use>\s*([a-z][a-z0-9_]*)\s*([\s\S]*)$/i.exec(text)
        if (incompleteMatch) {
          const toolName = incompleteMatch[1]!.trim()
          const argsRaw = (incompleteMatch[2] ?? '').trim()
          const partialArgs: Record<string, unknown> = {}
          const pathM = /"path"\s*:\s*"([^"]*)"/.exec(argsRaw)
          if (pathM) partialArgs['path'] = pathM[1]
          // Mark as truncated so the runtime knows to nudge for retry
          partialArgs['__truncated'] = true
          rawTC.push({
            id: 'tc_tu_trunc_' + Math.random().toString(36).slice(2),
            type: 'function',
            function: { name: toolName, arguments: JSON.stringify(partialArgs) },
          })
        }
      }
      if (rawTC.length > 0) text = text.replace(/<tool_use>[\s\S]*/gi, '').trim()
    }

    // Format 4: Python-style   tool_name({"key": "value"})
    // Catches cases where the model writes function calls as pseudocode
    if (rawTC.length === 0) {
      const pyPattern = /\b([a-z][a-z0-9_]{2,})\s*\(\s*(\{[\s\S]*?\})\s*\)/g
      let pyMatch
      while ((pyMatch = pyPattern.exec(text)) !== null) {
        const name = pyMatch[1]!
        const argsRaw = pyMatch[2]!
        try {
          JSON.parse(argsRaw) // validate it's real JSON
          rawTC.push({
            id: 'tc_py_' + Math.random().toString(36).slice(2),
            type: 'function',
            function: { name, arguments: argsRaw },
          })
        } catch { /* not valid JSON args, skip */ }
      }
      if (rawTC.length > 0) {
        // Strip matched function call text from the response
        text = text.replace(/\b[a-z][a-z0-9_]{2,}\s*\(\s*\{[\s\S]*?\}\s*\)/g, '').trim()
      }
    }

    // Format 5: [calling: tool_name with {"key": "value"}] — model narrating what it's doing
    if (rawTC.length === 0) {
      const narPattern = /\[calling:\s*([a-z][a-z0-9_]*)\s+with\s+(\{[\s\S]*?\})\]/gi
      let narMatch
      while ((narMatch = narPattern.exec(text)) !== null) {
        const name = narMatch[1]!.trim()
        const argsRaw = (narMatch[2] ?? '').trim()
        try {
          JSON.parse(argsRaw)
          rawTC.push({
            id: 'tc_nar_' + Math.random().toString(36).slice(2),
            type: 'function',
            function: { name, arguments: argsRaw },
          })
        } catch { /* invalid JSON */ }
      }
      if (rawTC.length > 0) text = text.replace(/\[calling:[^\]]+\]/gi, '').trim()
    }

    const toolCalls = rawTC.map(tc => {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.function.arguments) as Record<string, unknown> } catch {
        try { input = JSON.parse(tc.function.arguments + '"\\}') as Record<string, unknown> } catch {
          input = { _raw: tc.function.arguments }
        }
      }
      return { id: tc.id, name: tc.function.name, input }
    })

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: text || null,
      ...(rawTC.length > 0 ? { tool_calls: rawTC } : {}),
    }
    return { text, toolCalls, messages: [...cleanMessages as ChatMessage[], assistantMsg] }
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    return (await this.chat({ systemPrompt, messages: [{ role: 'user', content: prompt }] })).text
  }
}

// Kept for backward-compat — not used internally
export function getProviderModel(_provider: string, _modelId?: string): string { return _modelId ?? 'default' }
export function getEffectiveApiKey(_provider: string, _apiKey: string): string { return _apiKey }
