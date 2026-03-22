export class MemoryManager {
  private store = new Map<string, string>()

  async init(): Promise<void> {
    // In-memory store initialised
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }

  async get(key: string): Promise<string | undefined> {
    return this.store.get(key)
  }

  async search(query: string): Promise<string[]> {
    return Array.from(this.store.values()).filter(v =>
      v.toLowerCase().includes(query.toLowerCase())
    )
  }
}
