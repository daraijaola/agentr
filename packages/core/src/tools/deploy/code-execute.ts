import { Type } from "@sinclair/typebox"
import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import path from "path"
import type { Tool, ToolExecutor, ToolResult } from "../types.js"

const MAX_INPUT_BYTES = 100 * 1024 // 100 KB

interface CodeExecuteParams {
  language: "python" | "javascript" | "bash"
  code: string
  timeout?: number
}

export const codeExecuteTool: Tool = {
  name: "code_execute",
  description: "Execute code in a sandboxed environment inside the tenant's container. Returns stdout, stderr, and exit code. Use this to test scripts before deploying them. Supports python, javascript (node), and bash.",
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

  // Enforce input size limit
  if (Buffer.byteLength(code, "utf8") > MAX_INPUT_BYTES) {
    return { success: false, error: `Code input exceeds 100 KB limit.` }
  }

  const containerName = `agentr-${tenantId}`
  const scriptName = language === "python" ? "script.py"
    : language === "javascript" ? "script.js"
    : "script.sh"
  const containerScriptPath = `/tmp/agentr-exec-${Date.now()}-${scriptName}`

  // Write script to a host temp file so we can copy it in
  const hostTmp = `/tmp/agentr-host-${tenantId}-${Date.now()}`
  try {
    mkdirSync(hostTmp, { recursive: true })
    const hostScript = path.join(hostTmp, scriptName)
    writeFileSync(hostScript, code, { encoding: "utf8" })

    // Copy script into container
    const cp = spawnSync("docker", ["cp", hostScript, `${containerName}:${containerScriptPath}`], {
      timeout: 10_000,
      encoding: "utf8",
    })
    if (cp.status !== 0) {
      return {
        success: false,
        error: `Container '${containerName}' not found or not running. Code execution requires an active tenant container.`,
      }
    }

    // Determine interpreter
    const interpreter = language === "python" ? "python3"
      : language === "javascript" ? "node"
      : "bash"

    // Execute inside container
    const exec = spawnSync(
      "docker",
      ["exec", containerName, "timeout", String(timeout), interpreter, containerScriptPath],
      { timeout: (timeout + 5) * 1000, encoding: "utf8" }
    )

    const stdout = ((exec.stdout ?? "") + (exec.stderr ?? "")).slice(0, 8000)
    const exitCode = exec.status ?? 1

    // Cleanup script inside container (best-effort)
    spawnSync("docker", ["exec", containerName, "rm", "-f", containerScriptPath], { timeout: 5000 })

    return {
      success: exitCode === 0,
      data: { stdout, exitCode, language },
    }
  } finally {
    try { rmSync(hostTmp, { recursive: true, force: true }) } catch {}
  }
}
