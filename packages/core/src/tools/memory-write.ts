import fs from "fs/promises"
import { getSafeFilePath } from "../soul/loader.js"

export const memoryWriteTool = {
  name: "memory_write",
  description:
    "Write or append to your MEMORY.md file. Use this to remember important facts, " +
    "contacts, decisions, or anything you want to recall in future conversations. " +
    "mode='overwrite' replaces the entire file. mode='append' adds a new entry at the end.",
  parameters: {
    type: "object" as const,
    properties: {
      content: { type: "string", description: "The markdown content to write into MEMORY.md" },
      mode: { type: "string", enum: ["append", "overwrite"], description: "append adds to end, overwrite replaces all" },
    },
    required: ["content", "mode"],
  },
  execute: async (
    params: { content: string; mode: "append" | "overwrite" },
    context: Record<string, unknown>
  ) => {
    const tenantId = context["tenantId"] as string
    if (!tenantId) return { success: false, error: "No tenantId in context" }
    const filePath = getSafeFilePath(tenantId, "MEMORY.md")
    try {
      if (params.mode === "overwrite") {
        await fs.writeFile(filePath, params.content, "utf8")
      } else {
        let existing = ""
        try { existing = await fs.readFile(filePath, "utf8") } catch { existing = "" }
        const separator = existing.trim() ? "\n\n" : ""
        await fs.writeFile(filePath, existing + separator + params.content, "utf8")
      }
      return { success: true, message: "Memory updated successfully" }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
