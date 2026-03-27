import { Type } from "@sinclair/typebox"
import { execSync, execFileSync, spawnSync } from "child_process"
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs"
import path from "path"
import type { Tool, ToolExecutor, ToolResult } from "../types.js"
import { getWorkspaceRoot } from "../../workspace/index.js"
const SESSIONS_ROOT = process.env["SESSIONS_PATH"] ?? "/root/agentr/sessions"
const LEGACY_WORKSPACE_ROOT = "/tmp/agentr-workspace"

// Allow only safe chars in user-supplied process names — prevents shell injection
function sanitizeProcessName(name: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid process name "${name}": only letters, digits, hyphens, and underscores are allowed`)
  }
  return name
}

type ProcessRegistry = Record<string, { file: string; interpreter: "node" | "python3" | "bash"; env: Record<string, string> }>

function registryPathForTenant(tenantId: string): string {
  return path.join(SESSIONS_ROOT, tenantId, ".agentr-processes.json")
}

function readRegistry(tenantId: string): ProcessRegistry {
  try {
    const p = registryPathForTenant(tenantId)
    if (!existsSync(p)) return {}
    const raw = readFileSync(p, "utf8")
    return JSON.parse(raw) as ProcessRegistry
  } catch {
    return {}
  }
}

function writeRegistry(tenantId: string, registry: ProcessRegistry): void {
  const dir = path.join(SESSIONS_ROOT, tenantId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(registryPathForTenant(tenantId), JSON.stringify(registry, null, 2), "utf8")
}

function resolveTenantScriptPath(tenantId: string, file: string): { workspaceDir: string; filePath: string } {
  const normalized = file.trim().replace(/^\/+/, "")

  const candidates = [
    {
      workspaceDir: path.join(SESSIONS_ROOT, tenantId),
      filePath: path.join(path.join(SESSIONS_ROOT, tenantId), normalized),
    },
    {
      workspaceDir: path.join(SESSIONS_ROOT, tenantId),
      filePath: path.join(path.join(SESSIONS_ROOT, tenantId), path.basename(normalized)),
    },
    {
      workspaceDir: path.join(LEGACY_WORKSPACE_ROOT, tenantId),
      filePath: path.join(path.join(LEGACY_WORKSPACE_ROOT, tenantId), normalized),
    },
    {
      workspaceDir: LEGACY_WORKSPACE_ROOT,
      filePath: path.join(LEGACY_WORKSPACE_ROOT, normalized),
    },
  ]

  const found = candidates.find((c) => existsSync(c.filePath))
  if (found) return found

  return candidates[0]
}

function tenantProcessName(tenantId: string, name: string): string {
  // Namespaced so tenants cant touch each other
  const short = tenantId.split("-")[0]
  return `agent-${short}-${name}`
}

// ── process_start ────────────────────────────────────────────────
interface ProcessStartParams {
  name: string
  file: string
  env?: Record<string, string>
  interpreter?: "node" | "python3" | "bash"
}

export const processStartTool: Tool = {
  name: "process_start",
  description: "Deploy and start a script as a persistent background process using PM2. The process survives restarts. Use this to deploy Telegram bots, servers, or any long-running script from your workspace. IMPORTANT: Always install dependencies via code_execute (bash: pip3 install ... or npm install ...) BEFORE calling this tool, or the process will crash. When the script is a web server on a PORT, always tell the user the public URL: http://${process.env.SERVER_PUBLIC_IP ?? 'localhost'}:PORT",
  parameters: Type.Object({
    name: Type.String({ description: "Short name for this process (e.g. mybot, server)" }),
    file: Type.String({ description: "Filename in your workspace to run (e.g. bot.js)" }),
    env: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Environment variables to inject (e.g. BOT_TOKEN)" })),
    interpreter: Type.Optional(Type.Union([
      Type.Literal("node"),
      Type.Literal("python3"),
      Type.Literal("bash"),
    ], { description: "Interpreter to use (auto-detected from extension if not set)" })),
  }),
}

export const processStartExecutor: ToolExecutor<ProcessStartParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  const tenantId = (_context as Record<string, unknown>)["tenantId"] as string
  if (!tenantId) return { success: false, error: "No tenantId in context" }

  let safeName: string
  try { safeName = sanitizeProcessName(params.name) } catch (err) { return { success: false, error: String(err) } }
  const { file, env = {}, interpreter } = params
  const name = safeName
  const workspaceDir = getWorkspaceRoot(tenantId)
  const rawFile = String(file ?? "").trim()
  const absoluteWorkspacePrefix = path.resolve(workspaceDir) + path.sep
  const filePath = path.isAbsolute(rawFile)
    ? path.resolve(rawFile)
    : path.resolve(workspaceDir, rawFile)
  if (!(filePath === path.resolve(workspaceDir) || filePath.startsWith(absoluteWorkspacePrefix))) {
    return { success: false, error: `Invalid workspace path: ${file}` }
  }
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found in workspace: ${file}. Expected under ${workspaceDir}. Use workspace_write first.` }
  }

  const pmName = tenantProcessName(tenantId, name)

  // Auto-detect interpreter
  let interp = interpreter
  if (!interp) {
    if (file.endsWith(".js") || file.endsWith(".mjs")) interp = "node"
    else if (file.endsWith(".py")) interp = "python3"
    else interp = "bash"
  }
  // Always normalize "python" -> "python3"
  if ((interp as string) === "python") interp = "python3"

  // Build env string for PM2
  // Write env vars to a shell wrapper script
  const envPrefix = Object.entries(env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")
  const envFlag = envPrefix ? `env ${envPrefix}` : ""

  try {
    // Stop existing process with same name if running
    try { execFileSync('pm2', ['delete', pmName], { encoding: "utf8", stdio: ['ignore', 'pipe', 'ignore'] }) } catch {}

    // Write a PM2 ecosystem config file so env vars survive PM2 auto-restarts.
    // Using the shell-prefix approach (env VAR=val pm2 start ...) loses vars on crash-restart.
    const ecosystemDir = path.join(SESSIONS_ROOT, tenantId)
    mkdirSync(ecosystemDir, { recursive: true })
    const ecosystemPath = path.join(ecosystemDir, `.pm2-${name}.config.cjs`)
    const ecosystemContent = `module.exports = { apps: [{ name: ${JSON.stringify(pmName)}, script: ${JSON.stringify(filePath)}, interpreter: ${JSON.stringify(interp)}, env: ${JSON.stringify(env)}, autorestart: true, max_restarts: 10, restart_delay: 2000, watch: false }] }`
    writeFileSync(ecosystemPath, ecosystemContent, "utf8")

    execFileSync('pm2', ['start', ecosystemPath], { encoding: "utf8" })

    // Wait a moment and check status
    await new Promise(r => setTimeout(r, 1500))
    const status = execFileSync('pm2', ['show', pmName], { encoding: "utf8", stdio: ['ignore', 'pipe', 'pipe'] })
    const isOnline = status.includes("online")

    const registry = readRegistry(tenantId)
    registry[name] = { file, interpreter: interp, env }
    writeRegistry(tenantId, registry)

    if (!isOnline) {
      return {
        success: false,
        error: `Process "${name}" failed to stay online after start. Use process_logs to debug.`,
      }
    }

    return {
      success: true,
      data: {
        name: pmName,
        file: filePath,
        status: "online",
        message: `Process "${name}" is live. Use process_logs to check output.`,
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── process_stop ─────────────────────────────────────────────────
interface ProcessStopParams { name: string }

export const processStopTool: Tool = {
  name: "process_stop",
  description: "Stop a running background process that was started with process_start.",
  parameters: Type.Object({
    name: Type.String({ description: "Process name used in process_start" }),
  }),
}

export const processStopExecutor: ToolExecutor<ProcessStopParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  const tenantId = (_context as Record<string, unknown>)["tenantId"] as string
  let safeName: string
  try { safeName = sanitizeProcessName(params.name) } catch (err) { return { success: false, error: String(err) } }
  const pmName = tenantProcessName(tenantId, safeName)
  try {
    execFileSync('pm2', ['delete', pmName], { encoding: "utf8" })
    return { success: true, data: { message: `Process "${params.name}" stopped and removed.` } }
  } catch (err) {
    return { success: false, error: `Could not stop process: ${String(err)}` }
  }
}

// ── process_restart ──────────────────────────────────────────────
interface ProcessRestartParams { name: string }

export const processRestartTool: Tool = {
  name: "process_restart",
  description: "Restart a background process. Use this after updating a file to apply changes.",
  parameters: Type.Object({
    name: Type.String({ description: "Process name to restart" }),
  }),
}

export const processRestartExecutor: ToolExecutor<ProcessRestartParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  const tenantId = (_context as Record<string, unknown>)["tenantId"] as string
  let safeName: string
  try { safeName = sanitizeProcessName(params.name) } catch (err) { return { success: false, error: String(err) } }
  const pmName = tenantProcessName(tenantId, safeName)
  try {
    execFileSync('pm2', ['restart', pmName], { encoding: "utf8" })
    await new Promise(r => setTimeout(r, 1000))
    return { success: true, data: { message: `Process "${params.name}" restarted.` } }
  } catch (err) {
    const registry = readRegistry(tenantId)
    const saved = registry[params.name]
    if (!saved) {
      return { success: false, error: `Could not restart: ${String(err)}` }
    }

    const restarted = await processStartExecutor(
      {
        name: params.name,
        file: saved.file,
        interpreter: saved.interpreter,
        env: saved.env,
      },
      _context,
    )

    if (!restarted.success) {
      return { success: false, error: `Restart fallback failed: ${String(restarted.error ?? 'unknown')}` }
    }

    return {
      success: true,
      data: {
        ...(restarted.data as Record<string, unknown>),
        message: `Process "${params.name}" was missing and has been started from saved config.`,
      },
    }
  }
}

// ── process_logs ─────────────────────────────────────────────────
interface ProcessLogsParams { name: string; lines?: number }

export const processLogsTool: Tool = {
  name: "process_logs",
  description: "Get the last N lines of logs from a running background process. Use this to check if a deployed bot or server is working correctly.",
  parameters: Type.Object({
    name: Type.String({ description: "Process name to get logs for" }),
    lines: Type.Optional(Type.Number({ description: "Number of log lines to return (default: 30)" })),
  }),
}

export const processLogsExecutor: ToolExecutor<ProcessLogsParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  const tenantId = (_context as Record<string, unknown>)["tenantId"] as string
  let safeName: string
  try { safeName = sanitizeProcessName(params.name) } catch (err) { return { success: false, error: String(err) } }
  const pmName = tenantProcessName(tenantId, safeName)
  const lines = Math.min(Math.max(1, params.lines ?? 30), 200) // clamp to 1-200
  try {
    const output = execFileSync('pm2', ['logs', pmName, '--lines', String(lines), '--nostream'], { encoding: "utf8", stdio: ['ignore', 'pipe', 'pipe'] })
    return { success: true, data: { logs: output.slice(0, 6000), lines } }
  } catch (err) {
    return { success: false, error: `Could not get logs: ${String(err)}` }
  }
}

// ── process_list ─────────────────────────────────────────────────
export const processListTool: Tool = {
  name: "process_list",
  description: "List all your running background processes and their status.",
  parameters: Type.Object({}),
}

export const processListExecutor: ToolExecutor<Record<string, never>> = async (
  _params,
  _context
): Promise<ToolResult> => {
  const tenantId = (_context as Record<string, unknown>)["tenantId"] as string
  const short = tenantId.split("-")[0]
  const prefix = `agent-${short}-`
  try {
    const output = execSync(`pm2 jlist 2>/dev/null`, { encoding: "utf8" })
    const all = JSON.parse(output) as Array<{ name: string; pm2_env: { status: string }; pid: number }>
    const mine = all
      .filter(p => p.name.startsWith(prefix))
      .map(p => ({
        name: p.name.replace(prefix, ""),
        status: p.pm2_env.status,
        pid: p.pid,
      }))
    return { success: true, data: { processes: mine, count: mine.length } }
  } catch {
    return { success: true, data: { processes: [], count: 0 } }
  }
}
