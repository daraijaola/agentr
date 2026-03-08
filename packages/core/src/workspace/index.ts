import path from 'path'

export const WORKSPACE_ROOT = '/tmp/agentr-workspace'

export const WORKSPACE_PATHS = {
  root: WORKSPACE_ROOT,
  files: path.join(WORKSPACE_ROOT, 'files'),
  temp: path.join(WORKSPACE_ROOT, 'temp'),
}

export const MAX_FILE_SIZES = {
  text: 1024 * 1024,
  binary: 10 * 1024 * 1024,
}

export class WorkspaceSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceSecurityError'
  }
}

export function validatePath(filePath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, filePath)
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new WorkspaceSecurityError(`Path traversal denied: ${filePath}`)
  }
  return resolved
}

export function validateReadPath(filePath: string): string {
  return validatePath(filePath)
}

export function validateWritePath(filePath: string): string {
  return validatePath(filePath)
}

export class WorkspaceManager {
  private files = new Map<string, { name: string; content: string; createdAt: Date; updatedAt: Date }>()

  write(name: string, content: string): void {
    const now = new Date()
    this.files.set(name, { name, content, createdAt: this.files.get(name)?.createdAt ?? now, updatedAt: now })
  }
  read(name: string): string | null { return this.files.get(name)?.content ?? null }
  list() { return Array.from(this.files.values()) }
  delete(name: string): boolean { return this.files.delete(name) }
  info(name: string) { return this.files.get(name) ?? null }
  rename(oldName: string, newName: string): boolean {
    const file = this.files.get(oldName)
    if (!file) return false
    this.files.set(newName, { ...file, name: newName })
    this.files.delete(oldName)
    return true
  }
}
