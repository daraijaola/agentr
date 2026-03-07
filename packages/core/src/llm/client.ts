import { complete, getModel } from '@mariozechner/pi-ai'
import type { Model, Api, Context, AssistantMessage, Tool } from '@mariozechner/pi-ai'

export type LLMProvider = 'anthropic' | 'openai' | 'moonshot'

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export interface ChatOptions {
  systemPrompt?: string
  context: Context
  tools?: Tool[]
  maxTokens?: number
  temperature?: number
}

export interface ChatResponse {
  message: AssistantMessage
  text: string
  context: Context
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai:    'gpt-4o',
  moonshot:  'kimi-k2',
}

const modelCache = new Map<string, Model<Api>>()

function getProviderModel(provider: LLMProvider, modelId: string): Model<Api> {
  const key = `${provider}:${modelId}`
  if (modelCache.has(key)) return modelCache.get(key)!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = getModel(provider as any, modelId as any)
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`)
  modelCache.set(key, model)
  return model
}

export class LLMClient {
  private config: LLMConfig

  constructor(config: LLMConfig) {
    this.config = config
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const provider = this.config.provider
    const modelId = this.config.model ?? DEFAULT_MODELS[provider]
    const model = getProviderModel(provider, modelId)

    const context: Context = {
      ...options.context,
      systemPrompt: options.systemPrompt ?? options.context.systemPrompt ?? '',
      tools: options.tools,
    }

    const response = await complete(model, context, {
      apiKey: this.config.apiKey,
      maxTokens: options.maxTokens ?? this.config.maxTokens ?? 4096,
      temperature: options.temperature ?? this.config.temperature ?? 0.7,
      cacheRetention: 'long',
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    return {
      message: response,
      text,
      context: {
        ...context,
        messages: [...(context.messages ?? []), response],
      },
    }
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const result = await this.chat({
      systemPrompt,
      context: { messages: [{ role: 'user', content: prompt }] },
    })
    return result.text
  }
}
