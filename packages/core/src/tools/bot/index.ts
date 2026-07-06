import type { ToolEntry } from "../types.js"
import { botInlineSendTool, botInlineSendExecutor } from "./inline-send.js"
import { createTelegramBotTool, createTelegramBotExecutor } from "./create-bot.js"
import { botFatherCommandTool, botFatherCommandExecutor } from "./botfather-command.js"
import { telegramBotApiTool, telegramBotApiExecutor } from "./bot-api.js"

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
  {
    tool: botFatherCommandTool,
    executor: botFatherCommandExecutor as never,
    scope: "dm-only",
  },
  {
    tool: telegramBotApiTool,
    executor: telegramBotApiExecutor as never,
    scope: "dm-only",
  },
]
