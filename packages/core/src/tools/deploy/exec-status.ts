import { Type } from '@sinclair/typebox'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { runCommand } from './runner.js'
export const execStatusTool: Tool = { name: 'exec_status', description: 'Get server status: disk, RAM, CPU, uptime, top processes.', category: 'deploy', parameters: Type.Object({}) }
const CMDS = [{ key: 'disk', command: 'df -h' }, { key: 'memory', command: 'free -h' }, { key: 'uptime', command: 'uptime' }, { key: 'processes', command: 'pm2 jlist 2>/dev/null || echo "[]"' }]
export const execStatusExecutor: ToolExecutor<Record<string, never>> = async (): Promise<ToolResult> => {
  const results: Record<string, string> = {}
  for (const { key, command } of CMDS) { const r = await runCommand(command, { timeout: 10_000 }); results[key] = r.exitCode === 0 ? r.stdout.trim() : `(failed)` }
  return { success: true, data: results }
}
