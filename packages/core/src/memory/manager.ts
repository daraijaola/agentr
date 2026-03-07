// Memory manager  SQLite WAL + FTS5 + sqlite-vec
// TODO: Adapt from Teleton src/memory/

export class MemoryManager {
  private dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  async init(): Promise<void> {
    console.log(`[MemoryManager] Init DB at ${this.dbPath}`)
    // TODO: open SQLite, run migrations, init FTS5 + sqlite-vec
  }

  async write(key: string, value: string): Promise<void> {
    // TODO: persist to SQLite
  }

  async read(key: string): Promise<string | null> {
    // TODO: read from SQLite
    return null
  }

  async search(query: string): Promise<string[]> {
    // TODO: FTS5 + vector search
    return []
  }
}
