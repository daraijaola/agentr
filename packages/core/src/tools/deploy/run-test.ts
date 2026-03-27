import { Type } from '@sinclair/typebox'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { runCommand } from './runner.js'

interface RunTestParams {
  command: string
  directory?: string
  timeout?: number
}

export const runTestTool: Tool = {
  name: 'run_test',
  description: 'Run a test suite or single test command (e.g. "pnpm test", "pytest tests/", "jest --testNamePattern amm", "cargo test"). Returns full output with pass/fail status. Use when the user says "run tests", "test X", or "check if Y works".',
  parameters: Type.Object({
    command: Type.String({ description: 'Test command to run, e.g. "pnpm test", "pytest", "jest amm.test.ts"' }),
    directory: Type.Optional(Type.String({ description: 'Working directory relative to workspace root (default: workspace root)' })),
    timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds (default: 120)' })),
  }),
}

export const runTestExecutor: ToolExecutor<RunTestParams> = async (params, context): Promise<ToolResult> => {
  const { command, timeout = 120 } = params
  const tenantId = (context as Record<string, unknown>)['tenantId'] as string | undefined
  const sessionsRoot = process.env['SESSIONS_PATH'] ?? '/root/agentr/sessions'

  let workDir = tenantId ? `${sessionsRoot}/${tenantId}` : sessionsRoot
  if (params.directory) {
    const safeDir = params.directory.replace(/\.\./g, '').replace(/^\/+/, '')
    workDir = `${workDir}/${safeDir}`
  }

  const fullCommand = `cd "${workDir}" && ${command}`
  const result = await runCommand(fullCommand, { timeout: timeout * 1000 }, tenantId)

  const passed = result.exitCode === 0 && !result.timedOut
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()

  return {
    success: passed,
    data: {
      passed,
      exitCode: result.exitCode,
      output: output.length > 4000 ? output.slice(-4000) + '\n...[truncated — showing last 4000 chars]' : output,
      duration: result.duration,
      timedOut: result.timedOut,
    },
    ...(result.timedOut ? { error: `Test timed out after ${timeout}s` } : !passed ? { error: `Tests failed (exit code ${result.exitCode})` } : {}),
  }
}
