export type LLMProvider = 'anthropic' | 'openai' | 'moonshot'
export interface LLMConfig { provider: LLMProvider; apiKey: string; model?: string; maxTokens?: number; temperature?: number }
export interface ChatMessage { role: 'user' | 'assistant' | 'system' | 'tool'; content: string | null; tool_call_id?: string; name?: string; tool_calls?: ToolCallRaw[] }
export interface ToolCallRaw { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatOptions { systemPrompt?: string; messages: ChatMessage[]; tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }
export interface ChatResponse { text: string; toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>; messages: ChatMessage[] }
const URLS: Record<LLMProvider, string> = { anthropic: 'https://api.anthropic.com/v1/chat/completions', openai: 'https://api.openai.com/v1/chat/completions', moonshot: 'https://api.moonshot.ai/v1/chat/completions' }
const DEFAULTS: Record<LLMProvider, string> = { anthropic: 'claude-sonnet-4-5', openai: 'gpt-4o', moonshot: 'moonshot-v1-8k' }
export class LLMClient {
  constructor(private config: LLMConfig) {}
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const { provider, apiKey } = this.config
    const model = this.config.model ?? DEFAULTS[provider]
    const messages: ChatMessage[] = []
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
    messages.push(...options.messages)
    const cleanMessages = messages.map(m => { const { reasoning_content, ...rest } = m as Record<string, unknown>; void reasoning_content; return rest })
    const body: Record<string, unknown> = { model, max_tokens: this.config.maxTokens ?? 1024, temperature: provider === 'moonshot' ? 1 : (this.config.temperature ?? 0.7), messages: cleanMessages, ...(provider === 'moonshot' ? { enable_thinking: false } : {}) }
    if (options.tools?.length) { body.tools = options.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })); body.tool_choice = 'auto' }
    const res = await fetch(URLS[provider], { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`)
    const data = await res.json() as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCallRaw[] } }> }
    const choice = data.choices[0]?.message
    const text = choice?.content ?? ''
    const rawTC = choice?.tool_calls ?? []
    const toolCalls = rawTC.map(tc => ({ id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) as Record<string, unknown> }))
    const assistantMsg: ChatMessage = { role: 'assistant', content: text || null, ...(rawTC.length > 0 ? { tool_calls: rawTC } : {}) }
    return { text, toolCalls, messages: [...cleanMessages, assistantMsg] }
  }
  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    return (await this.chat({ systemPrompt, messages: [{ role: 'user', content: prompt }] })).text
  }
}
