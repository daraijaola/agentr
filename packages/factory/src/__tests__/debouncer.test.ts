import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { MessageDebouncer } from '../debouncer.js'

describe('MessageDebouncer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('batches rapid messages from same chat', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const debouncer = new MessageDebouncer(500, flush)
    await debouncer.enqueue('chat-1', 'hello', 'sender-1')
    await debouncer.enqueue('chat-1', 'world', 'sender-1')
    vi.advanceTimersByTime(600)
    await Promise.resolve()
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('sends separate flushes for different chats', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const debouncer = new MessageDebouncer(500, flush)
    await debouncer.enqueue('chat-1', 'hello', 'sender-1')
    await debouncer.enqueue('chat-2', 'world', 'sender-2')
    vi.advanceTimersByTime(600)
    await Promise.resolve()
    await Promise.resolve()
    expect(flush).toHaveBeenCalledTimes(2)
  })
})
