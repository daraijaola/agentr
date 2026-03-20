import type { ToolEntry } from "../../types.js"
import { codeExecuteTool, codeExecuteExecutor } from "./code-execute.js"
import {
  processStartTool, processStartExecutor,
  processStopTool, processStopExecutor,
  processRestartTool, processRestartExecutor,
  processLogsTool, processLogsExecutor,
  processListTool, processListExecutor,
} from "./process-manage.js"

export const tools: ToolEntry[] = [
  { tool: codeExecuteTool, executor: codeExecuteExecutor as never, scope: "dm-only" },
  { tool: processStartTool, executor: processStartExecutor as never, scope: "dm-only" },
  { tool: processStopTool, executor: processStopExecutor as never, scope: "dm-only" },
  { tool: processRestartTool, executor: processRestartExecutor as never, scope: "dm-only" },
  { tool: processLogsTool, executor: processLogsExecutor as never, scope: "dm-only" },
  { tool: processListTool, executor: processListExecutor as never, scope: "dm-only" },
]
