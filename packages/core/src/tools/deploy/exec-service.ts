import { Type } from '@sinclair/typebox'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { runCommand } from './runner.js'
interface Params { action: 'start'|'stop'|'restart'|'status'|'enable'|'disable'; name: string }
export const execServiceTool: Tool = {
  name: 'exec_service', description: 'Manage systemd services — start, stop, restart, status, enable, disable.', category: 'deploy',
  parameters: Type.Object({
    action: Type.Union([Type.Literal('start'),Type.Literal('stop'),Type.Literal('restart'),Type.Literal('status'),Type.Literal('enable'),Type.Literal('disable')], { description: 'Action' }),
    name: Type.String({ description: "Service name e.g. 'nginx'" }),
  }),
}
export const execServiceExecutor: ToolExecutor<Params> = async (params): Promise<ToolResult> => {
  const result = await runCommand(`systemctl ${params.action} ${params.name}`, { timeout: 30_000 })
  return { success: result.exitCode === 0 && !result.timedOut, data: { service: params.name, action: params.action, stdout: result.stdout, stderr: result.stderr }, ...(result.exitCode !== 0 ? { error: `systemctl ${params.action} failed` } : {}) }
}
