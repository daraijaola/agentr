import { Type } from '@sinclair/typebox'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import type { Tool, ToolExecutor, ToolResult } from '../types.js'
import { getWorkspaceRoot } from '../../workspace/index.js'
import { runCommand } from '../deploy/runner.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('TonCompile')

interface TonCompileParams {
  filePath: string
  contractName?: string
}

export const tonCompileTool: Tool = {
  name: 'ton_compile',
  description: 'Compile a Tact or FunC smart contract in the workspace. Automatically sets up the build environment if needed. Returns compilation output with errors and warnings parsed line by line.',
  category: 'ton',
  parameters: Type.Object({
    filePath: Type.String({ description: 'Path to contract file relative to workspace (e.g. "contracts/MyToken.tact" or "contracts/token.fc")' }),
    contractName: Type.Optional(Type.String({ description: 'Contract name (defaults to filename without extension)' })),
  }),
}

export const tonCompileExecutor: ToolExecutor<TonCompileParams> = async (
  params,
  context
): Promise<ToolResult> => {
  const tenantId = (context as Record<string, unknown>)['tenantId'] as string
  const workspaceRoot = getWorkspaceRoot(tenantId)
  const { filePath } = params

  const absFile = path.resolve(workspaceRoot, filePath)
  if (!absFile.startsWith(workspaceRoot)) {
    return { success: false, error: 'Path traversal denied' }
  }

  if (!existsSync(absFile)) {
    return { success: false, error: `Contract file not found: ${filePath}` }
  }

  const ext = path.extname(filePath).toLowerCase()
  const baseName = params.contractName ?? path.basename(filePath, ext)
  const contractsDir = path.dirname(absFile)
  const buildDir = path.join(workspaceRoot, 'build')

  if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true })

  log.info({ tenantId, filePath, ext }, 'Compiling contract')

  if (ext === '.tact') {
    const configPath = path.join(workspaceRoot, 'tact.config.json')
    const relFile = path.relative(workspaceRoot, absFile)
    const config = {
      projects: [{
        name: baseName,
        path: relFile,
        output: `build/${baseName}`,
        options: { debug: false }
      }]
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2))

    const setupCmd = `cd "${workspaceRoot}" && npm ls @tact-lang/compiler 2>/dev/null || npm install --save-dev @tact-lang/compiler 2>&1 | tail -3`
    await runCommand(setupCmd, { timeout: 120_000 })

    const compileCmd = `cd "${workspaceRoot}" && npx tact --config tact.config.json 2>&1`
    const result = await runCommand(compileCmd, { timeout: 120_000 })

    const output = (result.stdout + result.stderr).trim()
    const errors = parseErrors(output)
    const success = result.exitCode === 0

    const bocPath = path.join(buildDir, baseName, `${baseName}.boc`)
    const abiPath = path.join(buildDir, baseName, `${baseName}.abi`)

    return {
      success,
      data: {
        contractName: baseName,
        output,
        errors,
        warnings: errors.filter(e => e.severity === 'warning'),
        buildDir: `build/${baseName}`,
        boc: success && existsSync(bocPath) ? bocPath : undefined,
        abi: success && existsSync(abiPath) ? abiPath : undefined,
        message: success
          ? `✅ Compiled ${baseName} — BOC at build/${baseName}/${baseName}.boc`
          : `❌ Compilation failed — ${errors.filter(e => e.severity === 'error').length} error(s)`,
      },
      ...(success ? {} : { error: errors.map(e => e.message).join('\n') || output }),
    }
  }

  if (ext === '.fc' || ext === '.func') {
    const setupCmd = `cd "${workspaceRoot}" && npm ls @ton/func-js-bin 2>/dev/null || npm install --save-dev @ton/func-js-bin 2>&1 | tail -3`
    await runCommand(setupCmd, { timeout: 120_000 })

    const outBoc = path.join(buildDir, `${baseName}.boc`)
    const compileCmd = `cd "${workspaceRoot}" && npx func-js "${absFile}" -o "${outBoc}" 2>&1`
    const result = await runCommand(compileCmd, { timeout: 60_000 })

    const output = (result.stdout + result.stderr).trim()
    const errors = parseErrors(output)
    const success = result.exitCode === 0 && existsSync(outBoc)

    return {
      success,
      data: {
        contractName: baseName,
        output,
        errors,
        buildDir: 'build',
        boc: success ? outBoc : undefined,
        message: success
          ? `✅ Compiled ${baseName}.fc — BOC at build/${baseName}.boc`
          : `❌ Compilation failed`,
      },
      ...(success ? {} : { error: errors.map(e => e.message).join('\n') || output }),
    }
  }

  return { success: false, error: `Unsupported file type: ${ext}. Use .tact or .fc/.func` }
}

interface CompileError {
  file?: string
  line?: number
  col?: number
  severity: 'error' | 'warning'
  message: string
}

function parseErrors(output: string): CompileError[] {
  const errors: CompileError[] = []
  const lines = output.split('\n')
  for (const line of lines) {
    const errMatch = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/i)
    if (errMatch) {
      errors.push({
        file: errMatch[1],
        line: parseInt(errMatch[2]!),
        col: parseInt(errMatch[3]!),
        severity: errMatch[4]!.toLowerCase() as 'error' | 'warning',
        message: errMatch[5]!,
      })
      continue
    }
    if (/error/i.test(line) && line.trim().length > 5 && !line.includes('npm')) {
      errors.push({ severity: 'error', message: line.trim() })
    }
  }
  return errors
}
