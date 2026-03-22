export const providers: Record<string, unknown> = {}
export function getProviderConfig(_name: string): Record<string, unknown> { return {} }
export const LLM_PROVIDERS = ['anthropic', 'moonshot', 'openai']

export type SupportedProvider = 'anthropic' | 'openai' | 'moonshot' | 'openai-codex' | 'gemini'
export interface ProviderMetadata { name: string; defaultModel: string; supportsVision: boolean }
export function getProviderMetadata(_provider: SupportedProvider): ProviderMetadata {
  return { name: _provider, defaultModel: 'default', supportsVision: false }
}
