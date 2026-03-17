interface DebounceBuffer {
  messages: string[]
  replyToId: number | undefined
  userName: string | undefined
  client: any
  timer: NodeJS.Timeout | null
  firstTime: number
}

export class MessageDebouncer {
  private buffers: Map<string, DebounceBuffer> = new Map()
  private readonly maxDebounceMs: number
  private readonly maxBufferSize = 5

  constructor(
    private debounceMs: number,
    private onFlush: (chatId: string, messages: string[], replyToId: number | undefined, userName: string | undefined, client: any) => Promise<void>
  ) {
    this.maxDebounceMs = debounceMs * 3
  }

  async enqueue(chatId: string, text: string, _senderId: string, replyToId?: number, userName?: string, client?: any): Promise<void> {
    const existing = this.buffers.get(chatId)
    if (existing) {
      if (existing.messages.length >= this.maxBufferSize) {
        await this.flushKey(chatId)
      } else {
        existing.messages.push(text)
        this.resetTimer(chatId, existing)
        return
      }
    }
    const buf: DebounceBuffer = { messages: [text], replyToId, userName, client, timer: null, firstTime: Date.now() }
    this.buffers.set(chatId, buf)
    this.resetTimer(chatId, buf)
  }

  private resetTimer(chatId: string, buf: DebounceBuffer): void {
    if (buf.timer) clearTimeout(buf.timer)
    const elapsed = Date.now() - buf.firstTime
    const remaining = Math.max(0, this.maxDebounceMs - elapsed)
    const delay = Math.min(this.debounceMs, remaining)
    buf.timer = setTimeout(() => { this.flushKey(chatId).catch(console.error) }, delay)
    buf.timer.unref?.()
  }

  private async flushKey(chatId: string): Promise<void> {
    const buf = this.buffers.get(chatId)
    if (!buf || buf.messages.length === 0) return
    this.buffers.delete(chatId)
    if (buf.timer) clearTimeout(buf.timer)
    await this.onFlush(chatId, buf.messages, buf.replyToId, buf.userName, buf.client)
  }

  async flushAll(): Promise<void> {
    for (const key of Array.from(this.buffers.keys())) await this.flushKey(key)
  }
}
