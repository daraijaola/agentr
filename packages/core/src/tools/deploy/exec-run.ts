import { Type } from '@sinclair/typebox'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { runCommand } from './runner.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('Exec')

interface ExecRunParams { command: string; timeout?: number }

export const execRunTool: Tool = {
  name: 'exec_run',
  description: 'Execute any bash command on the server. Returns stdout, stderr, exit code. Use to start bots with pm2, install packages, configure nginx, run scripts, check logs — anything system-level.',
  category: 'deploy',
  parameters: Type.Object({
    command: Type.String({ description: 'Bash command (supports pipes, &&, redirects, background & etc.)' }),
    timeout: Type.Optional(Type.Number({ description: 'Timeout seconds (default 30)' })),
  }),
}

export const execRunExecutor: ToolExecutor<ExecRunParams> = async (params, context): Promise<ToolResult> => {
  const { command, timeout = 30 } = params
  const tenantId = (context as Record<string, unknown>)['tenantId'] as string | undefined
  log.info({ command, tenantId }, 'exec_run')
  const result = await runCommand(command, { timeout: timeout * 1000 }, tenantId)
  return {
    success: result.exitCode === 0 && !result.timedOut,
    data: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, duration: result.duration, truncated: result.truncated, timedOut: result.timedOut },
    ...(result.timedOut ? { error: `Timed out after ${timeout}s` } : result.exitCode !== 0 ? { error: `Exit code ${result.exitCode}` } : {}),
  }
}
