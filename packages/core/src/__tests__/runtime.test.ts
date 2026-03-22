import { describe, it, expect, vi } from 'vitest'
import { AgentRuntime } from '../agent/runtime.js'
import type { AgentConfig } from '../types/index.js'

const mockConfig: AgentConfig = {
  tenantId: 'test-tenant-123',
  userId: 'test-user-123',
  telegramPhone: '+1234567890',
  llmProvider: 'anthropic',
  walletAddress: 'UQtest123',
}

const mockLLMConfig = {
  provider: 'anthropic' as const,
  apiKey: 'test-key',
  model: 'claude-sonnet-4-5',
  maxTokens: 1024,
}

describe('AgentRuntime', () => {
  it('initialises with empty conversation history', () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)
    expect(runtime.getConversationLength('chat-1')).toBe(0)
  })

  it('clears conversation history', () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)
    runtime.clearHistory('chat-1')
    expect(runtime.getConversationLength('chat-1')).toBe(0)
  })

  it('accepts deductCredits callback', () => {
    const deductCredits = vi.fn().mockResolvedValue(undefined)
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig, { deductCredits })
    expect(runtime).toBeDefined()
  })

  it('exposes tools registry', () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)
    expect(runtime.tools).toBeDefined()
    expect(Array.isArray(runtime.tools.list())).toBe(true)
  })

  it('updateLLM replaces LLM without throwing', () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)
    expect(() => runtime.updateLLM({ ...mockLLMConfig, model: 'gpt-4o', provider: 'openai' })).not.toThrow()
  })

  it('stop resolves without throwing', async () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)
    await expect(runtime.stop()).resolves.toBeUndefined()
  })
})
