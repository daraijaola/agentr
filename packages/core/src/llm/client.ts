// LLM client  Anthropic primary, pluggable via pi-ai
// TODO: Adapt from Teleton src/llm/

export type LLMProvider = 'anthropic' | 'openai' | 'groq'

export class LLMClient {
  private provider: LLMProvider
  private apiKey: string

  constructor(provider: LLMProvider, apiKey: string) {
    this.provider = provider
    this.apiKey = apiKey
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    // TODO: pi-ai multi-provider completion
    return `[${this.provider}] response to: ${prompt}`
  }
}
