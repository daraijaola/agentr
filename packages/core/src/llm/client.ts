export type LLMProvider = 'anthropic' | 'openai' | 'moonshot' | 'openai-codex' | 'air'
export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
  plan?: 'starter' | 'pro' | 'ultra' | 'elite' | 'enterprise'
  provisionedAt?: number // Unix ms — for starter 24h expiry check
}
export interface ChatMessage { role: 'user' | 'assistant' | 'system' | 'tool'; content: string | null; tool_call_id?: string; name?: string; tool_calls?: ToolCallRaw[] }
export interface ToolCallRaw { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatOptions { systemPrompt?: string; messages: ChatMessage[]; tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }
export interface ChatResponse { text: string; toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; messages: ChatMessage[] }

const URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  moonshot: 'https://api.moonshot.ai/v1/chat/completions',
  'openai-codex': 'https://chatgpt.com/backend-api/codex/responses',
}

const DEFAULTS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  moonshot: 'moonshot-v1-128k',
  'openai-codex': 'gpt-5.3-codex',
  air: 'claude-sonnet-4-6',
}

// Plan-based model allow-lists for AIR provider
const PLAN_MODELS: Record<string, string[]> = {
  starter: ['claude-sonnet-4-6'],
  pro: ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.5-pro'],
  ultra: ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.5-pro', 'claude-opus-4-6', 'gpt-5.2', 'gemini-3.1-pro-preview'],
  elite: ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.5-pro', 'claude-opus-4-6', 'gpt-5.2', 'gemini-3.1-pro-preview'],
  enterprise: ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.5-pro', 'claude-opus-4-6', 'gpt-5.2', 'gemini-3.1-pro-preview'],
}

const STARTER_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const MAX_INPUT_BYTES = 100 * 1024 // 100 KB

function checkPlanAccess(config: LLMConfig, model: string): void {
  if (config.provider !== 'air') return
  const plan = config.plan ?? 'starter'

  // Starter plan: 24h TTL
  if (plan === 'starter') {
    const provisionedAt = config.provisionedAt ?? Date.now()
    if (Date.now() - provisionedAt > STARTER_TTL_MS) {
      throw new Error(
        'Your Starter plan has expired (24-hour limit reached). Please upgrade to Pro or Ultra to continue using your AI agent.'
      )
    }
  }

  const allowed = PLAN_MODELS[plan] ?? PLAN_MODELS['starter']
  if (!allowed.includes(model)) {
    throw new Error(
      `Model '${model}' is not available on the ${plan} plan. ` +
      `Allowed models: ${allowed.join(', ')}. Please upgrade your plan to access this model.`
    )
  }
}

function enforceInputSizeLimit(messages: ChatMessage[]): void {
  const totalSize = messages.reduce((acc, m) => acc + Buffer.byteLength(String(m.content ?? ''), 'utf8'), 0)
  if (totalSize > MAX_INPUT_BYTES) {
    throw new Error(`Input messages exceed the 100 KB size limit (got ${Math.round(totalSize / 1024)} KB). Please shorten the conversation or start a new session.`)
  }
}

async function refreshCodexToken(): Promise<string> {
  const refreshToken = process.env.OPENAI_CODEX_REFRESH_TOKEN
  if (!refreshToken) throw new Error('No OPENAI_CODEX_REFRESH_TOKEN in env')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    refresh_token: refreshToken,
  })
  const res = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string }
  process.env.OPENAI_CODEX_ACCESS_TOKEN = data.access_token
  process.env.OPENAI_CODEX_EXPIRES = String(Date.now() + (data.expires_in ?? 3600) * 1000)
  if (data.refresh_token) process.env.OPENAI_CODEX_REFRESH_TOKEN = data.refresh_token
  return data.access_token
}

async function getCodexToken(): Promise<string> {
  const expires = parseInt(process.env.OPENAI_CODEX_EXPIRES ?? '0')
  const token = process.env.OPENAI_CODEX_ACCESS_TOKEN
  if (!token) throw new Error('No OPENAI_CODEX_ACCESS_TOKEN in env')
  if (Date.now() > expires - 5 * 60 * 1000) {
    return refreshCodexToken()
  }
  return token
}

export class LLMClient {
  constructor(private config: LLMConfig) {}

  getProvider(): string {
    return this.config.provider
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const { provider } = this.config
    const model = this.config.model ?? DEFAULTS[provider]
    const msgs: any[] = []
    if (options.systemPrompt) msgs.push({ role: 'system', content: options.systemPrompt })
    msgs.push(...options.messages)

    // Enforce input size limit on LLM calls
    enforceInputSizeLimit(options.messages)

    // Check plan-based model access (AIR provider only)
    checkPlanAccess(this.config, model)

    // Strip reasoning_content fields (some providers return these)
    const cleanMessages: any[] = msgs.map((m: any) => {
      const { reasoning_content, ...rest } = m
      void reasoning_content
      return rest
    })

    // AIR gateway routes to Claude which rejects role:"tool" — convert to role:"user"
    const airMessages: any[] = provider === 'air'
      ? cleanMessages.reduce((acc: any[], m: any) => {
          if (m.role === 'tool') {
            // Merge consecutive tool results into the previous user message if possible
            const prev = acc[acc.length - 1]
            const toolText = `[Tool: ${m.name ?? 'result'}]\n${m.content ?? ''}`
            if (prev?.role === 'user' && typeof prev.content === 'string') {
              prev.content += '\n\n' + toolText
            } else {
              acc.push({ role: 'user', content: toolText })
            }
            return acc
          }
          if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
            // Strip tool_calls — AIR sees them as <tool_call> text, keep only text content
            acc.push({ role: 'assistant', content: m.content ?? '' })
            return acc
          }
          acc.push(m)
          return acc
        }, [])
      : cleanMessages

    // Anthropic needs different message format
    const anthropicMessages: any[] = provider === 'anthropic'
      ? (() => {
          const filtered: any[] = []
          for (const m of cleanMessages) {
            if (m.role === 'system') continue

            if (m.role === 'tool') {
              const prev = filtered[filtered.length - 1]
              const hasMatch = prev?.role === 'assistant' && Array.isArray(prev.content) &&
                prev.content.some((b: any) => b.type === 'tool_use' && b.id === m.tool_call_id)
              if (!hasMatch) continue
              filtered.push({
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? 'unknown', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
              })
              continue
            }

            if (m.role === 'assistant' && m.tool_calls?.length) {
              const toolUseBlocks = m.tool_calls.map((tc: any) => ({
                type: 'tool_use', id: tc.id, name: tc.function.name,
                input: (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })()
              }))
              const textContent = typeof m.content === 'string' && m.content.trim() ? m.content.trim() : null
              filtered.push({ role: 'assistant', content: [...(textContent ? [{ type: 'text', text: textContent }] : []), ...toolUseBlocks] })
              continue
            }

            if (m.role === 'assistant') {
              const text = typeof m.content === 'string' ? m.content.trim() : ''
              if (!text) continue
              const prev = filtered[filtered.length - 1]
              if (prev?.role === 'assistant') {
                prev.content = [...(prev.content ?? []), { type: 'text', text }]
              } else {
                filtered.push({ role: 'assistant', content: [{ type: 'text', text }] })
              }
              continue
            }

            if (m.role === 'user') {
              const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
              const prev = filtered[filtered.length - 1]
              if (prev?.role === 'user') {
                prev.content = typeof prev.content === 'string'
                  ? [{ type: 'text', text: prev.content }, { type: 'text', text }]
                  : [...(Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: String(prev.content) }]), { type: 'text', text }]
              } else {
                filtered.push({ role: 'user', content: text })
              }
              continue
            }

            filtered.push(m)
          }
          return filtered
        })()
      : cleanMessages

    if (provider === 'openai-codex') {
      return this.chatCodex(model, cleanMessages, options)
    }

    // AIR provider uses OpenAI-compatible format with OPENAI_API_KEY as bearer
    const apiKey = provider === 'air'
      ? (process.env['OPENAI_API_KEY'] ?? this.config.apiKey)
      : this.config.apiKey

    const body: Record<string, unknown> = {
      model,
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: provider === 'moonshot' ? 1 : (this.config.temperature ?? 0.7),
      messages: provider === 'air' ? airMessages : anthropicMessages,
      ...(provider === 'anthropic' && options.systemPrompt ? {
        system: [{ type: 'text', text: options.systemPrompt, cache_control: { type: 'ephemeral' } }]
      } : {}),
      ...(provider === 'moonshot' ? { enable_thinking: false } : {})
    }
    if (options.tools?.length) {
      if (provider === 'anthropic') {
        body.tools = options.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
        body.tool_choice = { type: 'auto' }
      } else {
        body.tools = options.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }))
        body.tool_choice = 'auto'
      }
    }
    const requestUrl = provider === 'air'
      ? (process.env['AIR_BASE_URL'] ?? '') + '/chat/completions'
      : URLS[provider]!
    const res = await fetch(requestUrl, {
      method: 'POST',
      headers: provider === 'anthropic'
        ? { 'Content-Type': 'application/json', 'x-api-key': apiKey!, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' }
        : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`)

    if (provider === 'anthropic') {
      const data = await res.json() as { content: Array<Record<string, unknown>>; stop_reason: string }
      let text = ''
      const rawTC: ToolCallRaw[] = []
      for (const block of data.content ?? []) {
        if (block['type'] === 'text') text += (block['text'] as string) ?? ''
        else if (block['type'] === 'tool_use') {
          rawTC.push({ id: block['id'] as string, type: 'function', function: { name: block['name'] as string, arguments: JSON.stringify(block['input'] ?? {}) } })
        }
      }
      const toolCalls = rawTC.map(tc => {
        let input: Record<string, unknown> = {}
        try { input = JSON.parse(tc.function.arguments) as Record<string, unknown> } catch { input = { _raw: tc.function.arguments } }
        return { id: tc.id, name: tc.function.name, input }
      })
      const assistantMsg: ChatMessage = { role: 'assistant', content: text || null, ...(rawTC.length > 0 ? { tool_calls: rawTC } : {}) }
      return { text, toolCalls, messages: [...cleanMessages as ChatMessage[], assistantMsg] }
    }

    const data = await res.json() as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCallRaw[] } }> }
    const choice = data.choices[0]?.message
    let text = choice?.content ?? ''
    let rawTC: ToolCallRaw[] = choice?.tool_calls ?? []

    // AIR provider sometimes returns tool calls as <tool_call>{...}</tool_call> text tags
    // instead of structured function calls. Parse and extract them.
    if (provider === 'air' && rawTC.length === 0 && text.includes('<tool_call>')) {
      const tagPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g
      let match
      while ((match = tagPattern.exec(text)) !== null) {
        try {
          const parsed = JSON.parse(match[1]!) as { name?: string; arguments?: unknown }
          if (parsed.name) {
            const argsStr = typeof parsed.arguments === 'string'
              ? parsed.arguments
              : JSON.stringify(parsed.arguments ?? {})
            rawTC.push({
              id: 'tc_' + Math.random().toString(36).slice(2),
              type: 'function',
              function: { name: parsed.name, arguments: argsStr }
            })
          }
        } catch { /* malformed tag — skip */ }
      }
      if (rawTC.length > 0) {
        text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim()
      }
    }

    const toolCalls = rawTC.map(tc => {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.function.arguments) as Record<string, unknown> } catch {
        try { input = JSON.parse(tc.function.arguments + '"\\}') as Record<string, unknown> } catch { input = { _raw: tc.function.arguments } }
      }
      return { id: tc.id, name: tc.function.name, input }
    })
    const assistantMsg: ChatMessage = { role: 'assistant', content: text || null, ...(rawTC.length > 0 ? { tool_calls: rawTC } : {}) }
    return { text, toolCalls, messages: [...cleanMessages as ChatMessage[], assistantMsg] }
  }

  private async chatCodex(model: string, messages: any[], options: ChatOptions): Promise<ChatResponse> {
    const token = await getCodexToken()
    const inputMessages = messages
      .filter((m: any) => m.role !== 'system')
      .map((m: any) => {
        const role = m.role === 'tool' ? 'user' : m.role as string
        const text = String(m.content ?? '')
        const contentType = (role === 'assistant') ? 'output_text' : 'input_text'
        return { type: 'message', role, content: [{ type: contentType, text }] }
      })
    const instructions = messages.find((m: any) => m.role === 'system')?.content as string | undefined
    const body: Record<string, unknown> = {
      model,
      instructions: instructions ?? 'You are a helpful AI assistant.',
      input: inputMessages,
      store: false,
      stream: true,
      ...(options.tools?.length ? {
        tools: options.tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.inputSchema })),
        parallel_tool_calls: false
      } : {})
    }
    const res = await fetch(URLS['openai-codex']!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Openai-Sentinel-Turnstile-Token': ''
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`Codex error ${res.status}: ${await res.text()}`)
    const rawBody = await res.text()
    let text = ''
    const rawTC: ToolCallRaw[] = []
    const globalFnNames = new Map<string, string>()
    for (const line of rawBody.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const chunk = line.slice(6).trim()
      if (!chunk || chunk === '[DONE]') continue
      try {
        const evt = JSON.parse(chunk) as Record<string, unknown>
        const evtType = evt['type'] as string
        if (evtType === 'response.output_text.delta') {
          const delta = evt['delta']
          if (typeof delta === 'string') text += delta
          else if (delta && typeof (delta as Record<string,unknown>)['text'] === 'string') text += (delta as Record<string,unknown>)['text'] as string
        } else if (evtType === 'response.function_call_arguments.done') {
          const itemId = evt['item_id'] as string ?? 'tc_' + Math.random().toString(36).slice(2)
          const args = evt['arguments'] as string ?? '{}'
          const fnName = (globalFnNames.get(itemId)) ?? 'unknown'
          rawTC.push({ id: itemId, type: 'function', function: { name: fnName, arguments: args } })
        } else if (evtType === 'response.output_item.added') {
          const item = evt['item'] as Record<string, unknown>
          if (item?.['type'] === 'function_call') {
            globalFnNames.set(item['id'] as string, item['name'] as string)
          }
        } else if (evtType === 'response.done') {
          const resp = evt['response'] as Record<string, unknown>
          const output = resp?.['output'] as Array<Record<string, unknown>> ?? []
          for (const item of output) {
            if (item['type'] === 'message') {
              const parts = item['content'] as Array<Record<string, unknown>> ?? []
              const t = parts.filter(c => c['type'] === 'output_text').map(c => c['text'] as string ?? '').join('')
              if (t) text = t
            } else if (item['type'] === 'function_call') {
              rawTC.push({ id: item['call_id'] as string ?? 'tc_' + Math.random().toString(36).slice(2), type: 'function', function: { name: item['name'] as string ?? '', arguments: item['arguments'] as string ?? '{}' } })
            }
          }
        }
      } catch { continue }
    }
    const toolCalls = rawTC.map(tc => {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.function.arguments) as Record<string, unknown> } catch { input = { _raw: tc.function.arguments } }
      return { id: tc.id, name: tc.function.name, input }
    })
    const assistantMsg: ChatMessage = { role: 'assistant', content: text || null, ...(rawTC.length > 0 ? { tool_calls: rawTC } : {}) }
    return { text, toolCalls, messages: [...messages as ChatMessage[], assistantMsg] }
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    return (await this.chat({ systemPrompt, messages: [{ role: 'user', content: prompt }] })).text
  }
}

export function getProviderModel(_provider: string, _modelId?: string): string {
  return _modelId ?? 'default'
}
export function getEffectiveApiKey(_provider: string, _apiKey: string): string {
  return _apiKey
}
