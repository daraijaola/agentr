import { Type } from "@sinclair/typebox"
import type { Tool, ToolExecutor, ToolResult } from "../types.js"
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync } from "fs"
import { execSync } from "child_process"
import path from "path"

interface SubAgentTask {
  role: "coder" | "executor" | "researcher" | "reviewer" | "writer" | "deployer"
  task: string
  context?: string
  output_file?: string  // tell sub-agent which file to write
}

interface SwarmExecuteParams {
  goal: string
  tasks: SubAgentTask[]
  parallel?: boolean
}

interface SubAgentResult {
  role: string
  task: string
  result: string
  success: boolean
  duration_ms: number
}

const ROLE_PROMPTS: Record<string, string> = {
  coder: `You are an expert software engineer sub-agent. Write clean, complete, working code. Keep file content under 4000 characters per write. Use workspace_write to save files. Handle errors. Output a brief summary of what you wrote when done.`,
  executor: `You are a code execution sub-agent. Use code_execute to run python, javascript, or bash. Report exact output from the run.`,
  researcher: `You are a research and analysis sub-agent. Extract key facts, structure your output clearly. Be concise and factual.`,
  reviewer: `You are a code review sub-agent. List specific bugs and issues. Suggest exact fixes. Be brief and direct.`,
  writer: `You are a content writing sub-agent. Write clear, engaging content. Use workspace_write to save your output. Report the file path when done.`,
  deployer: `You are a deployment sub-agent. Your job is to take a file already written to the workspace and publish it live. Use serve_static with the correct path. Report the public URL when done.`,
}

const SESSIONS_ROOT = process.env["SESSIONS_PATH"] ?? "/root/agentr/sessions"
const PUBLIC_BASE = "https://agentr.online/sites"
const SITES_ROOT = process.env["SITES_PATH"] ?? "/var/www/agentr-sites"

function getWorkspaceDir(tenantId: string): string {
  return path.join(SESSIONS_ROOT, tenantId)
}

// Tools available to each role
function getToolsForRole(role: string) {
  const workspaceTools = [
    {
      type: "function" as const,
      function: {
        name: "workspace_write",
        description: "Write a file to the workspace. Keep content under 4000 characters.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to workspace root" },
            content: { type: "string", description: "File content (max 4000 chars)" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "workspace_read",
        description: "Read a file from the workspace",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to workspace root" },
          },
          required: ["path"],
        },
      },
    },
  ]

  const serveStaticTool = {
    type: "function" as const,
    function: {
      name: "serve_static",
      description: "Publish a file from the workspace to a public URL. Pass the workspace-relative file path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root, e.g. 'index.html'" },
        },
        required: ["path"],
      },
    },
  }

  const codeExecuteTool = {
    type: "function" as const,
    function: {
      name: "code_execute",
      description: "Execute python, javascript, or bash code in a sandboxed environment.",
      parameters: {
        type: "object",
        properties: {
          language: { type: "string", enum: ["python", "javascript", "bash"] },
          code: { type: "string", description: "Code to execute" },
          timeout: { type: "number", description: "Timeout in seconds (default 30)" },
        },
        required: ["language", "code"],
      },
    },
  }

  if (role === "deployer") return [...workspaceTools, serveStaticTool]
  if (role === "executor") return [...workspaceTools, codeExecuteTool]
  return workspaceTools
}

function executeSwarmTool(toolName: string, input: Record<string, unknown>, tenantId: string): string {
  const workspaceDir = getWorkspaceDir(tenantId)
  try {
    if (toolName === "workspace_write") {
      const filePath = String(input["path"] ?? "").replace(/^\/+/, "")
      const content = String(input["content"] ?? "")
      const abs = path.resolve(workspaceDir, filePath)
      if (!abs.startsWith(path.resolve(workspaceDir))) return JSON.stringify({ success: false, error: "Path outside workspace" })
      mkdirSync(path.dirname(abs), { recursive: true })
      writeFileSync(abs, content, "utf-8")
      return JSON.stringify({ success: true, data: { path: filePath, size: content.length, message: "File written" } })
    }

    if (toolName === "workspace_read") {
      const filePath = String(input["path"] ?? "").replace(/^\/+/, "")
      const abs = path.resolve(workspaceDir, filePath)
      if (!abs.startsWith(path.resolve(workspaceDir))) return JSON.stringify({ success: false, error: "Path outside workspace" })
      if (!existsSync(abs)) return JSON.stringify({ success: false, error: `File not found: ${filePath}` })
      const content = readFileSync(abs, "utf-8")
      return JSON.stringify({ success: true, data: { path: filePath, content: content.slice(0, 8000) } })
    }

    if (toolName === "serve_static") {
      const safePath = String(input["path"] ?? "").replace(/\.\./g, "").replace(/^\/+/, "").trim()
      if (!safePath) return JSON.stringify({ success: false, error: "path is required" })
      const sourcePath = path.join(workspaceDir, safePath)
      if (!existsSync(sourcePath)) return JSON.stringify({ success: false, error: `File not found in workspace: ${safePath}` })
      const destDir = path.join(SITES_ROOT, tenantId)
      mkdirSync(destDir, { recursive: true })
      const destPath = path.join(destDir, path.basename(safePath))
      try {
        execSync(`cp -r "${sourcePath}" "${destPath}"`, { stdio: "ignore" })
      } catch {
        return JSON.stringify({ success: false, error: "Failed to copy files to public directory" })
      }
      const isDir = existsSync(destPath) && lstatSync(destPath).isDirectory()
      const publicUrl = isDir
        ? `${PUBLIC_BASE}/${tenantId}/${path.basename(safePath)}/`
        : `${PUBLIC_BASE}/${tenantId}/${path.basename(safePath)}`
      return JSON.stringify({ success: true, data: { url: publicUrl, message: `Live at ${publicUrl}` } })
    }

    if (toolName === "code_execute") {
      return JSON.stringify({ success: false, error: "code_execute is not available in swarm sub-agents. Use workspace_write to save code then process_start to run it." })
    }

    return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` })
  } catch (err) {
    return JSON.stringify({ success: false, error: String(err) })
  }
}

const MAX_SUBAGENT_ITERS = 8

async function runSubAgent(
  task: SubAgentTask,
  airBaseUrl: string,
  apiKey: string,
  model: string,
  tenantId: string
): Promise<{ result: string; success: boolean; url?: string }> {
  const systemPrompt = ROLE_PROMPTS[task.role] ?? ROLE_PROMPTS.researcher
  const userMessage = task.context
    ? `Context:\n${task.context}\n\nTask:\n${task.task}${task.output_file ? `\n\nWrite output to: ${task.output_file}` : ""}`
    : task.task + (task.output_file ? `\n\nWrite output to: ${task.output_file}` : "")

  type OAIMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }
  const messages: OAIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]
  const tools = getToolsForRole(task.role)
  const textAccum: string[] = []
  let foundUrl: string | undefined
  let iters = 0

  try {
    while (iters < MAX_SUBAGENT_ITERS) {
      iters++
      const res = await fetch(`${airBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages,
          tools,
          tool_choice: "auto",
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return { result: `Sub-agent API error ${res.status}: ${errText.slice(0, 200)}`, success: false }
      }

      const data = await res.json() as {
        choices: Array<{
          message: {
            role: string
            content: string | null
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
          }
          finish_reason: string
        }>
      }

      const choice = data.choices[0]
      if (!choice) return { result: "Sub-agent returned no response.", success: false }

      const msg = choice.message
      if (msg.content) textAccum.push(msg.content)

      // Done if no tool calls
      if (!msg.tool_calls || msg.tool_calls.length === 0 || choice.finish_reason === "stop") {
        break
      }

      // Append assistant message with tool calls
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls })

      // Execute each tool call
      for (const tc of msg.tool_calls) {
        let toolInput: Record<string, unknown> = {}
        try { toolInput = JSON.parse(tc.function.arguments) } catch { /* invalid args */ }
        const toolResult = executeSwarmTool(tc.function.name, toolInput, tenantId)

        // Extract URL if serve_static succeeded
        try {
          const parsed = JSON.parse(toolResult) as { success?: boolean; data?: { url?: string } }
          if (parsed.success && parsed.data?.url) foundUrl = parsed.data.url
        } catch { /* not parseable */ }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: toolResult,
        })
      }
    }

    const combined = textAccum.join("\n").trim()
    return { result: combined || "Sub-agent completed.", success: true, url: foundUrl }
  } catch (err) {
    return { result: `Sub-agent error: ${String(err)}`, success: false }
  }
}

export const swarmExecuteTool: Tool = {
  name: "swarm_execute",
  description: `Spawn multiple specialized sub-agents to work in parallel on a complex goal. Use for any task with 2+ distinct workstreams (e.g. writing code + deploying + writing content simultaneously). Roles: coder (writes code files), deployer (publishes a file to a live URL via serve_static — always pair with coder for web tasks), researcher (analysis/research), reviewer (code review), writer (content), executor (runs code). Parallel sub-agents share the workspace so coder writes files that deployer can then publish. Returns all results combined.`,
  parameters: Type.Object({
    goal: Type.String({ description: "The overall goal this swarm is working toward" }),
    tasks: Type.Array(Type.Object({
      role: Type.Union([
        Type.Literal("coder"),
        Type.Literal("executor"),
        Type.Literal("researcher"),
        Type.Literal("reviewer"),
        Type.Literal("writer"),
        Type.Literal("deployer"),
      ]),
      task: Type.String({ description: "Specific task for this sub-agent" }),
      context: Type.Optional(Type.String({ description: "Additional context or instructions" })),
      output_file: Type.Optional(Type.String({ description: "Workspace file path this sub-agent should write to, e.g. 'index.html'" })),
    })),
    parallel: Type.Optional(Type.Boolean({ description: "Run in parallel (default: true). Set false for sequential tasks where later agents need earlier results." })),
  }),
}

export const swarmExecuteExecutor: ToolExecutor<SwarmExecuteParams> = async (params, context): Promise<ToolResult> => {
  const { goal, tasks, parallel = true } = params
  const airBaseUrl = process.env["AIR_BASE_URL"]
  const apiKey = process.env["OPENAI_API_KEY"] ?? ""
  if (!airBaseUrl) return { success: false, error: "AIR_BASE_URL not set — swarm requires the AIR gateway" }
  if (!apiKey) return { success: false, error: "OPENAI_API_KEY (AIR key) not set" }
  const subAgentModel = process.env["SWARM_MODEL"] ?? process.env["LLM_MODEL"] ?? "claude-haiku-4-5-20251001"
  const tenantId = (context as Record<string, unknown>)["tenantId"] as string ?? ""
  const startTime = Date.now()
  const results: SubAgentResult[] = []
  const allUrls: string[] = []

  console.log(`[Swarm] Goal: "${goal.slice(0, 80)}" | ${tasks.length} sub-agents | parallel=${parallel} | model=${subAgentModel}`)

  if (parallel) {
    const resolved = await Promise.all(tasks.map(async (task) => {
      const t0 = Date.now()
      console.log(`[Swarm] Spawning ${task.role}: ${task.task.slice(0, 60)}`)
      const { result, success, url } = await runSubAgent(task, airBaseUrl, apiKey, subAgentModel, tenantId)
      if (url) allUrls.push(url)
      const duration = Date.now() - t0
      console.log(`[Swarm] ${task.role} done in ${duration}ms | success=${success}`)
      return { role: task.role, task: task.task, result, success, duration_ms: duration }
    }))
    results.push(...resolved)
  } else {
    let accumulatedContext = ""
    for (const task of tasks) {
      const t0 = Date.now()
      const contextStr = accumulatedContext
        ? `Previous results:\n${accumulatedContext}\n\n${task.context ?? ""}`
        : task.context
      const { result, success, url } = await runSubAgent(
        { ...task, context: contextStr },
        airBaseUrl, apiKey, subAgentModel, tenantId
      )
      if (url) allUrls.push(url)
      accumulatedContext += `\n[${task.role}]: ${result.slice(0, 600)}\n`
      results.push({ role: task.role, task: task.task, result, success, duration_ms: Date.now() - t0 })
    }
  }

  const totalDuration = Date.now() - startTime
  const summary = results.map(r => {
    const truncated = r.result.length > 800
      ? r.result.slice(0, 800) + "\n...[truncated]"
      : r.result
    return `=== ${r.role.toUpperCase()} (${r.duration_ms}ms) ===\nTask: ${r.task}\nResult:\n${truncated}`
  }).join("\n\n")

  return {
    success: results.some(r => r.success),
    data: {
      goal,
      total_duration_ms: totalDuration,
      sub_agents_run: results.length,
      all_succeeded: results.every(r => r.success),
      urls: allUrls,
      results: results.map(r => ({ role: r.role, success: r.success, duration_ms: r.duration_ms })),
      output: summary,
      message: `Swarm completed: ${results.length} sub-agents in ${(totalDuration / 1000).toFixed(1)}s.${allUrls.length ? " URLs: " + allUrls.join(", ") : ""}`,
    },
  }
}

export const tools = [
  { tool: swarmExecuteTool, executor: swarmExecuteExecutor as never, scope: "dm-only" as const },
]
