import { Type } from '@sinclair/typebox'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { runCommand } from './runner.js'

// Allow only safe package name characters — prevents shell injection via package names
const SAFE_PKG_RE = /^[a-zA-Z0-9._@/:~^<>=!*[\]-]+$/

function sanitizePackages(packages: string): string {
  const parts = packages.trim().split(/\s+/)
  for (const pkg of parts) {
    if (!SAFE_PKG_RE.test(pkg)) throw new Error(`Unsafe package name rejected: "${pkg}"`)
  }
  return parts.join(' ')
}

const CMDS: Record<string, (p: string) => string> = { apt: p => `apt install -y ${p}`, pip: p => `pip install ${p}`, npm: p => `npm install -g ${p}`, docker: p => `docker pull ${p}` }
interface Params { manager: 'apt' | 'pip' | 'npm' | 'docker'; packages: string }
export const execInstallTool: Tool = {
  name: 'exec_install', description: 'Install packages using apt, pip, npm, or docker pull.', category: 'deploy',
  parameters: Type.Object({
    manager: Type.Union([Type.Literal('apt'), Type.Literal('pip'), Type.Literal('npm'), Type.Literal('docker')], { description: 'Package manager' }),
    packages: Type.String({ description: "Space-separated package names e.g. 'python3-pip nginx'" }),
  }),
}
export const execInstallExecutor: ToolExecutor<Params> = async (params): Promise<ToolResult> => {
  const { manager, packages } = params
  const cmd = CMDS[manager]; if (!cmd) return { success: false, error: `Unknown manager: ${manager}` }
  let safePkgs: string
  try { safePkgs = sanitizePackages(packages) } catch (err) { return { success: false, error: String(err) } }
  const result = await runCommand(cmd(safePkgs), { timeout: 120_000 })
  return { success: result.exitCode === 0 && !result.timedOut, data: { manager, packages, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }, ...(result.timedOut ? { error: 'Timed out after 120s' } : result.exitCode !== 0 ? { error: `Failed exit ${result.exitCode}` } : {}) }
}
