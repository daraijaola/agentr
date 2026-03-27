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

describe('AgentRuntime — basic', () => {
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

describe('AgentRuntime — concurrency guard', () => {
  it('starts not busy', () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)
    expect(runtime.isBusy).toBe(false)
  })

  it('returns busy message when loop is already running', async () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)

    // Stub LLM so it hangs indefinitely for the first call
    let resolveFirst: () => void
    const firstCallDone = new Promise<void>(res => { resolveFirst = res })
    const mockChat = vi.fn()
      .mockImplementationOnce(() => firstCallDone.then(() => ({ text: 'done', toolCalls: [], messages: [] })))
    ;(runtime as any).llm = { chat: mockChat, getProvider: () => 'openai-codex' }

    // Fire first message — it will hang
    const first = runtime.processMessage({ chatId: 'c1', userMessage: 'task 1' })

    // Give the event loop a tick so activeLoops is incremented
    await new Promise(r => setImmediate(r))

    // Second message while first is still running
    const second = await runtime.processMessage({ chatId: 'c1', userMessage: 'task 2' })
    expect(second.content).toMatch(/still working|wait/i)

    // Unblock the first
    resolveFirst!()
    await first

    // Now the runtime is free again
    expect(runtime.isBusy).toBe(false)
  })

  it('processes next message after previous completes', async () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)
    const mockChat = vi.fn().mockResolvedValue({ text: 'reply', toolCalls: [], messages: [{ role: 'assistant', content: 'reply' }] })
    ;(runtime as any).llm = { chat: mockChat, getProvider: () => 'openai-codex' }

    const r1 = await runtime.processMessage({ chatId: 'c1', userMessage: 'hello' })
    expect(r1.content).toBe('reply')

    const r2 = await runtime.processMessage({ chatId: 'c1', userMessage: 'hello again' })
    expect(r2.content).toBe('reply')
  })
})

describe('AgentRuntime — looksLikeFinalReport (via processMessage)', () => {
  it('accepts a sentence-terminated response as final', async () => {
    const runtime = new AgentRuntime(mockConfig, mockLLMConfig)
    const response = 'Your bot has been deployed successfully.'
    const mockChat = vi.fn().mockResolvedValue({ text: response, toolCalls: [], messages: [{ role: 'assistant', content: response }] })
    ;(runtime as any).llm = { chat: mockChat, getProvider: () => 'openai-codex' }

    const result = await runtime.processMessage({ chatId: 'c1', userMessage: 'deploy my bot' })
    expect(result.content).toBe(response)
  })
})
