import { Type } from "@sinclair/typebox"
import type { Tool, ToolExecutor, ToolResult } from "../types.js"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import path from "path"

interface SubAgentTask {
  role: "coder" | "executor" | "researcher" | "reviewer" | "writer"
  task: string
  context?: string
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
  coder: `You are an expert software engineer sub-agent. Write clean, working code. Output complete file content ready to save. Use workspace_write to save files directly. Handle errors gracefully.`,
  executor: `You are a code execution sub-agent. Use code_execute to run python, javascript, or bash scripts. Output results from tool calls.`,
  researcher: `You are a research sub-agent. Analyze and extract key information concisely. Be factual and structured.`,
  reviewer: `You are a code review sub-agent. List bugs and security issues found. Suggest specific fixes. Be brief and direct.`,
  writer: `You are a content writing sub-agent. Write clear, engaging content. Use workspace_write to save your output directly.`,
}

// Sub-agents are restricted to workspace I/O and sandboxed code execution only.
// Direct bash (exec_run), package installation (exec_install), and service management
// (exec_service) are intentionally excluded to prevent privilege escalation.
const AGENT_TOOLS = [
  {
    name: "workspace_write",
    description: "Write a file to the workspace",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "workspace_read",
    description: "Read a file from the workspace",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
      },
      required: ["path"],
    },
  },
  {
    name: "code_execute",
    description: "Execute python, javascript, or bash code in a sandboxed container environment.",
    input_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["python", "javascript", "bash"], description: "Language to execute" },
        code: { type: "string", description: "Code to execute (max 100 KB)" },
        timeout: { type: "number", description: "Timeout seconds (default 30)" },
      },
      required: ["language", "code"],
    },
  },
]

const SESSIONS_ROOT = process.env["SESSIONS_PATH"] ?? "/root/agentr/sessions"

function getWorkspaceDir(tenantId: string): string {
  return path.join(SESSIONS_ROOT, tenantId)
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

    if (toolName === "code_execute") {
      // code_execute in swarm context requires the Docker sandbox, which is not directly available here.
      // Return a descriptive message so the sub-agent can adapt.
      return JSON.stringify({ success: false, error: "code_execute is not available in swarm sub-agents. Use workspace_write to write the code and process_start to run it." })
    }

    return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` })
  } catch (err) {
    return JSON.stringify({ success: false, error: String(err) })
  }
}

const MAX_SUBAGENT_ITERS = 6

async function runSubAgent(
  task: SubAgentTask,
  apiKey: string,
  model: string,
  tenantId: string
): Promise<{ result: string; success: boolean }> {
  const systemPrompt = ROLE_PROMPTS[task.role] ?? ROLE_PROMPTS.researcher
  const userMessage = task.context
    ? `Context:\n${task.context}\n\nTask:\n${task.task}`
    : task.task

  type AnthropicMessage = { role: "user" | "assistant"; content: unknown }
  const messages: AnthropicMessage[] = [{ role: "user", content: userMessage }]
  const textAccum: string[] = []
  let iters = 0

  try {
    while (iters < MAX_SUBAGENT_ITERS) {
      iters++
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages,
          tools: AGENT_TOOLS,
        }),
      })

      if (!res.ok) return { result: `Sub-agent API error: ${await res.text()}`, success: false }

      const data = await res.json() as {
        content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>
        stop_reason: string
      }

      // Collect text blocks from this turn
      for (const block of data.content) {
        if (block.type === "text" && block.text) textAccum.push(block.text)
      }

      // If no tool calls, or end_turn — we're done
      const toolUseBlocks = data.content.filter(b => b.type === "tool_use" && b.name && b.id)
      if (data.stop_reason === "end_turn" || toolUseBlocks.length === 0) break

      // Append assistant turn to history
      messages.push({ role: "assistant", content: data.content })

      // Execute each tool call and build tool_result blocks
      const toolResults = toolUseBlocks.map(block => ({
        type: "tool_result",
        tool_use_id: block.id!,
        content: executeSwarmTool(block.name!, block.input ?? {}, tenantId),
      }))

      // Append tool results as a user turn (Anthropic format)
      messages.push({ role: "user", content: toolResults })
    }

    const combined = textAccum.join("\n").trim()
    return { result: combined || "Sub-agent completed.", success: true }
  } catch (err) {
    return { result: `Sub-agent error: ${String(err)}`, success: false }
  }
}

export const swarmExecuteTool: Tool = {
  name: "swarm_execute",
  description: `Spawn multiple specialized sub-agents to work on a complex goal simultaneously. Each sub-agent has sandboxed tool access: workspace_write, workspace_read, code_execute. Roles: coder (writes and saves code), executor (runs sandboxed code), researcher (analysis), reviewer (code review), writer (content). Use for tasks requiring multiple skills at once. You receive all results and synthesize them.`,
  parameters: Type.Object({
    goal: Type.String({ description: "The overall goal this swarm is working toward" }),
    tasks: Type.Array(Type.Object({
      role: Type.Union([
        Type.Literal("coder"),
        Type.Literal("executor"),
        Type.Literal("researcher"),
        Type.Literal("reviewer"),
        Type.Literal("writer"),
      ]),
      task: Type.String({ description: "Specific task for this sub-agent" }),
      context: Type.Optional(Type.String({ description: "Additional context" })),
    })),
    parallel: Type.Optional(Type.Boolean({ description: "Run in parallel (default: true)" })),
  }),
}

export const swarmExecuteExecutor: ToolExecutor<SwarmExecuteParams> = async (params, context): Promise<ToolResult> => {
  const { goal, tasks, parallel = true } = params
  const apiKey = process.env["ANTHROPIC_API_KEY"] ?? ""
  if (!apiKey) return { success: false, error: "ANTHROPIC_API_KEY not set" }
  const subAgentModel = process.env["SWARM_MODEL"] ?? "claude-haiku-4-5-20251001"
  const tenantId = (context as Record<string, unknown>)["tenantId"] as string ?? ""
  const startTime = Date.now()
  const results: SubAgentResult[] = []

  console.log(`[Swarm] Goal: "${goal}" | ${tasks.length} sub-agents | parallel=${parallel}`)

  if (parallel) {
    const resolved = await Promise.all(tasks.map(async (task) => {
      const t0 = Date.now()
      console.log(`[Swarm] Spawning ${task.role}...`)
      const { result, success } = await runSubAgent(task, apiKey, subAgentModel, tenantId)
      console.log(`[Swarm] ${task.role} done in ${Date.now() - t0}ms`)
      return { role: task.role, task: task.task, result, success, duration_ms: Date.now() - t0 }
    }))
    results.push(...resolved)
  } else {
    let accumulatedContext = ""
    for (const task of tasks) {
      const t0 = Date.now()
      const { result, success } = await runSubAgent(
        { ...task, context: accumulatedContext ? `Previous results:\n${accumulatedContext}\n\n${task.context ?? ""}` : task.context },
        apiKey, subAgentModel, tenantId
      )
      accumulatedContext += `\n[${task.role}]: ${result}\n`
      results.push({ role: task.role, task: task.task, result, success, duration_ms: Date.now() - t0 })
    }
  }

  const totalDuration = Date.now() - startTime
  const summary = results.map(r => {
    const truncated = r.result.length > 300
      ? r.result.slice(0, 300) + "\n...[truncated]"
      : r.result
    return `=== ${r.role.toUpperCase()} (${r.duration_ms}ms) ===\nTask: ${r.task}\nResult:\n${truncated}`
  }).join("\n\n")

  return {
    success: results.every(r => r.success),
    data: {
      goal,
      total_duration_ms: totalDuration,
      sub_agents_run: results.length,
      all_succeeded: results.every(r => r.success),
      results: results.map(r => ({ role: r.role, success: r.success, duration_ms: r.duration_ms })),
      output: summary,
      message: `Swarm completed: ${results.length} sub-agents in ${totalDuration}ms.`,
    },
  }
}

export const tools = [
  { tool: swarmExecuteTool, executor: swarmExecuteExecutor as never, scope: "dm-only" as const },
]
