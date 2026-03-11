import type { Tool, ToolExecutor, ToolResult } from "../types.js"
import { Type } from "@sinclair/typebox"

interface CreateBotParams {
  name: string
  username: string
}

export const createTelegramBotTool: Tool = {
  name: "create_telegram_bot",
  description: "Create a Telegram bot via BotFather. Handles full conversation, retries if username taken.",
  parameters: Type.Object({
    name: Type.String({ description: "Bot display name" }),
    username: Type.String({ description: "Bot username (must end in bot)" }),
  }),
}

export const createTelegramBotExecutor: ToolExecutor<CreateBotParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  const bridge = (_context as Record<string, unknown>)["bridge"] as {
    getClient(): { getClient(): import("telegram").TelegramClient }
  }
  if (!bridge) return { success: false, error: "No bridge" }

  const { name, username } = params
  const baseUsername = username.endsWith("bot") ? username.slice(0, -3) : username
  
  for (let attempt = 0; attempt < 3; attempt++) {
    const suffix = attempt === 0 ? "" : Math.floor(Math.random() * 9000 + 1000).toString()
    const finalUsername = baseUsername + suffix + "bot"
    
    try {
      const client = bridge.getClient().getClient()

      await client.sendMessage("BotFather" as never, { message: "/newbot" })
      await new Promise(r => setTimeout(r, 2500))

      await client.sendMessage("BotFather" as never, { message: name })
      await new Promise(r => setTimeout(r, 2500))

      await client.sendMessage("BotFather" as never, { message: finalUsername })
      await new Promise(r => setTimeout(r, 3500))

      const msgs = await client.getMessages("BotFather", { limit: 8 })
      let token = ""
      let errorMsg = ""
      
      for (const msg of msgs) {
        if (msg.out) continue
        const text = msg.message ?? ""
        
        if (text.includes("already taken") || text.includes("invalid")) {
          errorMsg = text
          break
        }
        
        const match = text.match(/\d{8,12}:[A-Za-z0-9_-]{35,}/)
        if (match) {
          token = match[0]
          break
        }
      }

      if (token) {
        return {
          success: true,
          data: {
            token,
            username: finalUsername,
            name,
            message: "Bot @" + finalUsername + " created. Token: " + token,
          },
        }
      }
      
      if (errorMsg.includes("taken")) {
        console.log("Username " + finalUsername + " taken, retrying...")
        continue
      }
      
      return { success: false, error: "BotFather error: " + (errorMsg || "No token received") }
      
    } catch (err) {
      if (attempt === 2) return { success: false, error: String(err) }
    }
  }
  
  return { success: false, error: "Failed after 3 username attempts" }
}
