export type LLMProvider = 'anthropic' | 'openai' | 'moonshot' | 'openai-codex'
export interface LLMConfig { provider: LLMProvider; apiKey: string; model?: string; maxTokens?: number; temperature?: number }
export interface ChatMessage { role: 'user' | 'assistant' | 'system' | 'tool'; content: string | null; tool_call_id?: string; name?: string; tool_calls?: ToolCallRaw[] }
export interface ToolCallRaw { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatOptions { systemPrompt?: string; messages: ChatMessage[]; tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }
export interface ChatResponse { text: string; toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; messages: ChatMessage[] }

const URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  moonshot: 'https://api.moonshot.ai/v1/chat/completions',
  'openai-codex': 'https://chatgpt.com/backend-api/codex/responses'
}
const DEFAULTS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
  moonshot: 'moonshot-v1-128k',
  'openai-codex': 'gpt-5.3-codex'
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
  // Refresh if expiring within 5 minutes
  if (Date.now() > expires - 5 * 60 * 1000) {
    return refreshCodexToken()
  }
  return token
}

export class LLMClient {
  constructor(private config: LLMConfig) {}
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const { provider } = this.config
    const model = this.config.model ?? DEFAULTS[provider]
    const messages: ChatMessage[] = []
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
    messages.push(...options.messages)
    const cleanMessages = messages.map(m => { const { reasoning_content, ...rest } = m as Record<string, unknown>; void reasoning_content; return rest })

    // Anthropic needs different message format
    const anthropicMessages = provider === 'anthropic'
      ? cleanMessages
          .filter((m: any) => m.role !== 'system')
          .filter((m: any, i: number, arr: any[]) => {
            // Remove orphaned tool results
            if (m.role !== 'tool') return true
            const prev = arr[i - 1]
            return prev?.role === 'assistant' && (prev.tool_calls?.some((tc: any) => tc.id === m.tool_call_id) || (Array.isArray(prev.content) && prev.content.some((b: any) => b.type === 'tool_use' && b.id === m.tool_call_id)))
          })
          .map((m: any) => {
            if (m.role === 'tool') {
              // Convert tool results to Anthropic format
              return {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? m.id ?? 'unknown', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
              }
            }
            if (m.role === 'assistant' && m.tool_calls?.length) {
              // Convert assistant tool calls to Anthropic format
              const toolUseBlocks = m.tool_calls.map((tc: any) => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })()
              }))
              const textContent = typeof m.content === 'string' && m.content.trim() ? m.content.trim() : null
              return {
                role: 'assistant',
                content: [
                  ...(textContent ? [{ type: 'text', text: textContent }] : []),
                  ...toolUseBlocks
                ]
              }
            }
            if (m.role === 'assistant') {
              const text = typeof m.content === 'string' ? m.content.trim() : ''
              return { role: 'assistant', content: [{ type: 'text', text: text || ' ' }] }
            }
            return m
          })
      : cleanMessages

    if (provider === 'openai-codex') {
      return this.chatCodex(model, cleanMessages, options)
    }

    const apiKey = this.config.apiKey

    // anthropicMessages already defined above with full message transformation

    const body: Record<string, unknown> = {
      model,
      max_tokens: this.config.maxTokens ?? 512,
      temperature: provider === 'moonshot' ? 1 : (this.config.temperature ?? 0.7),
      messages: anthropicMessages,
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
    const res = await fetch(URLS[provider], {
      method: 'POST',
      headers: provider === 'anthropic'
        ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' }
        : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`)

    // Anthropic Messages API response format
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
      return { text, toolCalls, messages: [...cleanMessages, assistantMsg] }
    }

    // OpenAI / Moonshot response format
    const data = await res.json() as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCallRaw[] } }> }
    const choice = data.choices[0]?.message
    const text = choice?.content ?? ''
    const rawTC = choice?.tool_calls ?? []
    const toolCalls = rawTC.map(tc => {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.function.arguments) as Record<string, unknown> } catch {
        try { input = JSON.parse(tc.function.arguments + '"\}') as Record<string, unknown> } catch { input = { _raw: tc.function.arguments } }
      }
      return { id: tc.id, name: tc.function.name, input }
    })
    const assistantMsg: ChatMessage = { role: 'assistant', content: text || null, ...(rawTC.length > 0 ? { tool_calls: rawTC } : {}) }
    return { text, toolCalls, messages: [...cleanMessages, assistantMsg] }
  }

  private async chatCodex(model: string, messages: Record<string, unknown>[], options: ChatOptions): Promise<ChatResponse> {
    const token = await getCodexToken()
    // Codex endpoint requires system prompt in 'instructions', not in input array
    const inputMessages = messages.filter((m: Record<string, unknown>) => m['role'] !== 'system').map((m: Record<string, unknown>) => {
      const role = m['role'] === 'tool' ? 'user' : m['role'] as string
      const text = String(m['content'] ?? '')
      // assistant messages use output_text, user/tool messages use input_text
      const contentType = (role === 'assistant') ? 'output_text' : 'input_text'
      return { type: 'message', role, content: [{ type: contentType, text }] }
    })
    const instructions = messages.find((m: Record<string, unknown>) => m['role'] === 'system')?.['content'] as string | undefined
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
    const res = await fetch(URLS['openai-codex'], {
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
          // We need the function name — track it from output_item.added
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
