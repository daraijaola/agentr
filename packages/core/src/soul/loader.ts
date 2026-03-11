import fs from "fs/promises"
import path from "path"

const WORKSPACE_ROOT = "/root/agentr/workspaces"

const WORKSPACE_FILES = [
  "SOUL.md",
  "IDENTITY.md",
  "STRATEGY.md",
  "SECURITY.md",
  "USER.md",
  "MEMORY.md",
] as const

export async function loadWorkspace(tenantId: string): Promise<string> {
  const workspacePath = path.join(WORKSPACE_ROOT, tenantId)
  const sections: string[] = []

  for (const file of WORKSPACE_FILES) {
    const filePath = path.join(workspacePath, file)
    try {
      const text = await fs.readFile(filePath, "utf8")
      if (text.trim()) {
        const label = file.replace(".md", "")
        sections.push(`<${label}>\n${text.trim()}\n</${label}>`)
      }
    } catch {
      // file missing — skip
    }
  }

  return sections.join("\n\n")
}

export function getWorkspacePath(tenantId: string): string {
  return path.join(WORKSPACE_ROOT, tenantId)
}

export function getSafeFilePath(tenantId: string, filename: string): string {
  const safe = path.basename(filename)
  return path.join(WORKSPACE_ROOT, tenantId, "workspace", safe)
}
