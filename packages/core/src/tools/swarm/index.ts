import { Type } from "@sinclair/typebox"
import type { Tool, ToolExecutor, ToolResult } from "../../types.js"

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
  coder: `You are an expert software engineer sub-agent. Write clean, working code only. Output the complete file content. Handle errors gracefully.`,
  executor: `You are a bash execution sub-agent. Output ONLY the exact shell commands needed, one per line. No explanations.`,
  researcher: `You are a research sub-agent. Analyze and extract key information concisely. Be factual and structured.`,
  reviewer: `You are a code review sub-agent. List bugs and security issues found. Suggest specific fixes. Be brief.`,
  writer: `You are a content writing sub-agent. Write clear, engaging content. Output directly, ready to use.`,
}

async function runSubAgent(task: SubAgentTask, apiKey: string, model: string): Promise<{ result: string; success: boolean }> {
  const systemPrompt = ROLE_PROMPTS[task.role] ?? ROLE_PROMPTS.researcher
  const userMessage = task.context ? `Context:\n${task.context}\n\nTask:\n${task.task}` : task.task
  try {
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
        max_tokens: 512,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage }],
      }),
    })
    if (!res.ok) return { result: `Sub-agent API error: ${await res.text()}`, success: false }
    const data = await res.json() as { content: Array<{ type: string; text?: string }> }
    const text = data.content.filter(b => b.type === "text").map(b => b.text ?? "").join("")
    return { result: text, success: true }
  } catch (err) {
    return { result: `Sub-agent error: ${String(err)}`, success: false }
  }
}

export const swarmExecuteTool: Tool = {
  name: "swarm_execute",
  description: `Spawn multiple specialized sub-agents to work on a complex goal simultaneously. Each sub-agent has a role: coder (writes code), executor (bash commands), researcher (analysis), reviewer (code review), writer (content). Use this for tasks requiring multiple skills at once — e.g. building a full app. You receive all results and synthesize them. ROLES: coder | executor | researcher | reviewer | writer`,
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

export const swarmExecuteExecutor: ToolExecutor<SwarmExecuteParams> = async (params, _context): Promise<ToolResult> => {
  const { goal, tasks, parallel = false } = params
  const apiKey = process.env["ANTHROPIC_API_KEY"] ?? ""
  if (!apiKey) return { success: false, error: "ANTHROPIC_API_KEY not set" }
  const subAgentModel = process.env["SWARM_MODEL"] ?? "claude-haiku-4-5-20251001"
  const startTime = Date.now()
  const results: SubAgentResult[] = []

  console.log(`[Swarm] Goal: "${goal}" | ${tasks.length} sub-agents | parallel=${parallel}`)

  if (parallel) {
    const resolved = await Promise.all(tasks.map(async (task) => {
      const t0 = Date.now()
      console.log(`[Swarm] Spawning ${task.role}...`)
      const { result, success } = await runSubAgent(task, apiKey, subAgentModel)
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
        apiKey, subAgentModel
      )
      accumulatedContext += `\n[${task.role}]: ${result}\n`
      results.push({ role: task.role, task: task.task, result, success, duration_ms: Date.now() - t0 })
    }
  }

  const totalDuration = Date.now() - startTime
  const summary = results.map(r => {
    const truncated = r.result.length > 150 ? r.result.slice(0, 150) + '\n...[truncated, use workspace_write to save full content]' : r.result
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
      message: `Swarm completed: ${results.length} sub-agents in ${totalDuration}ms. Synthesize the output above.`,
    },
  }
}

export const tools = [
  { tool: swarmExecuteTool, executor: swarmExecuteExecutor as never, scope: "dm-only" as const },
]
