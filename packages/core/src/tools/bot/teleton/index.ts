import type { ToolEntry } from "../types.js"
import { botInlineSendTool, botInlineSendExecutor } from "./inline-send.js"
import { createTelegramBotTool, createTelegramBotExecutor } from "./create-bot.js"

export const tools: ToolEntry[] = [
  {
    tool: botInlineSendTool,
    executor: botInlineSendExecutor,
    scope: "always",
  },
  {
    tool: createTelegramBotTool,
    executor: createTelegramBotExecutor as never,
    scope: "dm-only",
  },
]
