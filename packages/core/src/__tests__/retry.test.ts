import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '../utils/retry.js'

describe('withRetry', () => {
  it('resolves on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries and eventually succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success')
    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respects shouldRetry to stop early', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'))
    await expect(
      withRetry(fn, { maxAttempts: 5, initialDelayMs: 1, shouldRetry: () => false })
    ).rejects.toThrow('fatal')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
