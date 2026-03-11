import { Type } from "@sinclair/typebox"
import { execSync } from "child_process"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import path from "path"
import type { Tool, ToolExecutor, ToolResult } from "../types.js"

interface CodeExecuteParams {
  language: "python" | "javascript" | "bash"
  code: string
  timeout?: number
}

export const codeExecuteTool: Tool = {
  name: "code_execute",
  description: "Execute code in a sandboxed environment. Returns stdout, stderr, and exit code. Use this to test scripts before deploying them. Supports python, javascript (node), and bash.",
  parameters: Type.Object({
    language: Type.Union([
      Type.Literal("python"),
      Type.Literal("javascript"),
      Type.Literal("bash"),
    ], { description: "Language to execute" }),
    code: Type.String({ description: "Code to execute" }),
    timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 30)" })),
  }),
}

export const codeExecuteExecutor: ToolExecutor<CodeExecuteParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  const { language, code, timeout = 30 } = params
  const tenantId = ((_context as Record<string, unknown>)["tenantId"] as string) ?? "default"
  const tmpDir = `/tmp/agentr-exec-${tenantId}-${Date.now()}`

  try {
    mkdirSync(tmpDir, { recursive: true })

    let cmd: string
    if (language === "python") {
      writeFileSync(path.join(tmpDir, "script.py"), code)
      cmd = `cd ${tmpDir} && timeout ${timeout} python3 script.py 2>&1`
    } else if (language === "javascript") {
      writeFileSync(path.join(tmpDir, "script.js"), code)
      cmd = `cd ${tmpDir} && timeout ${timeout} node script.js 2>&1`
    } else {
      writeFileSync(path.join(tmpDir, "script.sh"), code)
      cmd = `cd ${tmpDir} && timeout ${timeout} bash script.sh 2>&1`
    }

    let output = ""
    let exitCode = 0
    try {
      output = execSync(cmd, { encoding: "utf8", maxBuffer: 1024 * 1024 })
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number; message?: string }
      output = ((e.stdout ?? "") + (e.stderr ?? "")) || (e.message ?? String(err))
      exitCode = e.status ?? 1
    }

    return {
      success: exitCode === 0,
      data: {
        stdout: output.slice(0, 8000),
        exitCode,
        language,
      },
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}
