import { Type } from '@sinclair/typebox'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { runCommand } from './runner.js'
export const execStatusTool: Tool = { name: 'exec_status', description: 'Get server status: disk, RAM, CPU, uptime, top processes.', category: 'deploy', parameters: Type.Object({}) }
const BASE_CMDS = [{ key: 'disk', command: 'df -h' }, { key: 'memory', command: 'free -h' }, { key: 'uptime', command: 'uptime' }]

import { execFileSync } from 'child_process'
function containerRunning(tenantId: string): boolean {
  try {
    const out = execFileSync('docker', ['inspect', '--format={{.State.Status}}', `agentr-${tenantId}`], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return out === 'running'
  } catch { return false }
}

export const execStatusExecutor: ToolExecutor<Record<string, never>> = async (_p, ctx): Promise<ToolResult> => {
  const tenantId = (ctx as Record<string, unknown>)['tenantId'] as string | undefined
  const useDocker = !!tenantId && containerRunning(tenantId)
  const results: Record<string, string> = {}
  for (const { key, command } of BASE_CMDS) { const r = await runCommand(command, { timeout: 10_000 }); results[key] = r.exitCode === 0 ? r.stdout.trim() : '(failed)' }
  // Get pm2 list from the right place
  try {
    const pm2Raw = useDocker
      ? execFileSync('docker', ['exec', `agentr-${tenantId}`, 'pm2', 'jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      : execFileSync('pm2', ['jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    results['processes'] = pm2Raw.trim()
  } catch { results['processes'] = '[]' }
  results['sandbox'] = useDocker ? `docker (agentr-${tenantId})` : 'host'
  return { success: true, data: results }
}
