import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const SESSIONS_ROOT = process.env['SESSIONS_PATH'] ?? '/root/agentr/sessions'

function getMemoryPath(tenantId: string): string {
  return join(SESSIONS_ROOT, tenantId, 'MEMORY.md')
}

function ensureDir(tenantId: string): void {
  const dir = join(SESSIONS_ROOT, tenantId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export class MemoryManager {
  private tenantId: string

  constructor(tenantId = 'default') {
    this.tenantId = tenantId
  }

  async init(): Promise<void> {
    ensureDir(this.tenantId)
  }

  async set(key: string, value: string): Promise<void> {
    ensureDir(this.tenantId)
    const path = getMemoryPath(this.tenantId)
    let content = existsSync(path) ? readFileSync(path, 'utf-8') : ''
    const regex = new RegExp(`^## ${key}\\n[\\s\\S]*?(?=^## |$)`, 'm')
    const entry = `## ${key}\n${value}\n`
    if (regex.test(content)) {
      content = content.replace(regex, entry)
    } else {
      content = content + '\n' + entry
    }
    writeFileSync(path, content.trim() + '\n', 'utf-8')
  }

  async get(key: string): Promise<string | undefined> {
    const path = getMemoryPath(this.tenantId)
    if (!existsSync(path)) return undefined
    const content = readFileSync(path, 'utf-8')
    const regex = new RegExp(`^## ${key}\\n([\\s\\S]*?)(?=^## |$)`, 'm')
    const match = content.match(regex)
    return match ? match[1]?.trim() : undefined
  }

  async getAll(): Promise<string> {
    const path = getMemoryPath(this.tenantId)
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf-8')
  }

  async search(query: string): Promise<string[]> {
    const path = getMemoryPath(this.tenantId)
    if (!existsSync(path)) return []
    const content = readFileSync(path, 'utf-8')
    const lower = query.toLowerCase()
    return content
      .split('\n')
      .filter(line => line.toLowerCase().includes(lower))
  }
}
