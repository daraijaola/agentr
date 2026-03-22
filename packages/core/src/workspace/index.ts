import path from 'path'
import { existsSync, lstatSync } from 'fs'

const SESSIONS_ROOT = process.env['SESSIONS_PATH'] ?? '/root/agentr/sessions'
export const WORKSPACE_ROOT = process.env['SESSIONS_PATH'] ?? '/root/agentr/sessions'

export const WORKSPACE_PATHS = {
  root: WORKSPACE_ROOT,
  files: WORKSPACE_ROOT + '/files',
  temp: WORKSPACE_ROOT + '/temp',
  MEMORY_DIR: WORKSPACE_ROOT + '/memory',
  DOWNLOADS_DIR: WORKSPACE_ROOT + '/downloads',
  UPLOADS_DIR: WORKSPACE_ROOT + '/uploads',
  TEMP_DIR: WORKSPACE_ROOT + '/temp',
  MEMES_DIR: WORKSPACE_ROOT + '/memes',
  MEMORY: WORKSPACE_ROOT + '/MEMORY.md',
}

export const MAX_FILE_SIZES = {
  read: 1024 * 1024,
  write: 512 * 1024,
  total_workspace: 500 * 1024 * 1024,
}

export function getWorkspaceRoot(tenantId: string): string {
  return path.join(SESSIONS_ROOT, tenantId)
}

export class WorkspaceSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceSecurityError'
  }
}

export interface ValidatedPath {
  absolutePath: string
  relativePath: string
  exists: boolean
  extension?: string
  isDirectory?: boolean
  filename?: string
}

function resolveRoot(tenantId?: string): string {
  return tenantId ? getWorkspaceRoot(tenantId) : WORKSPACE_ROOT
}

export function validatePath(filePath: string, tenantId?: string): string {
  const root = resolveRoot(tenantId)
  const resolved = path.resolve(root, filePath)
  if (!resolved.startsWith(root)) throw new WorkspaceSecurityError('Path traversal denied: ' + filePath)
  return resolved
}

export function validateWritePath(filePath: string, tenantId?: string): ValidatedPath {
  const root = resolveRoot(tenantId)
  const resolved = path.resolve(root, filePath)
  if (!resolved.startsWith(root)) throw new WorkspaceSecurityError('Path traversal denied: ' + filePath)
  const ext = path.extname(resolved)
  const fname = path.basename(resolved)
  const isDir = existsSync(resolved) && require('fs').lstatSync(resolved).isDirectory()
  return { absolutePath: resolved, relativePath: path.relative(root, resolved), exists: existsSync(resolved), extension: ext, filename: fname, isDirectory: isDir }
}

export function validateReadPath(filePath: string, tenantId?: string): ValidatedPath {
  return validateWritePath(filePath, tenantId)
}

export function validateDeletePath(filePath: string, tenantId?: string): ValidatedPath {
  return validateWritePath(filePath, tenantId)
}

export function validateDirectory(dirPath: string, tenantId?: string): ValidatedPath {
  const root = resolveRoot(tenantId)
  const resolved = path.resolve(root, dirPath)
  if (!resolved.startsWith(root)) throw new WorkspaceSecurityError('Path traversal denied: ' + dirPath)
  const exists = existsSync(resolved)
  if (exists && !lstatSync(resolved).isDirectory()) throw new WorkspaceSecurityError('Not a directory: ' + dirPath)
  return { absolutePath: resolved, relativePath: path.relative(root, resolved), exists }
}
