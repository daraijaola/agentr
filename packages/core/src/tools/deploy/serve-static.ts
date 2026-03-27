import { Type } from "@sinclair/typebox"
import { execSync } from "child_process"
import { existsSync, mkdirSync, cpSync, copyFileSync } from "fs"
import { join, basename } from "path"
import type { Tool, ToolExecutor, ToolResult } from "../types.js"

const PUBLIC_BASE = "https://agentr.online/sites"
const SITES_ROOT = process.env["SITES_PATH"] ?? "/var/www/agentr-sites"

export const serveStaticTool: Tool = {
  name: "serve_static",
  description: "Publish a file or folder from your workspace so it's accessible via a public URL. Pass the path relative to your workspace root, e.g. 'index.html' or 'mysite/' (directory). Returns a live public URL.",
  parameters: Type.Object({
    path: Type.String({ description: "File or directory path relative to your workspace root, e.g. 'index.html' or 'mysite/'" }),
  }),
}

export const serveStaticExecutor: ToolExecutor<{ path: string }> = async (params, context): Promise<ToolResult> => {
  const tenantId = context.tenantId
  const sessionsRoot = process.env["SESSIONS_PATH"] ?? "/root/agentr/sessions"
  const workspaceRoot = join(sessionsRoot, tenantId)

  // Sanitize path — no traversal
  const safePath = params.path.replace(/\.\./g, "").replace(/^\/+/, "").trim()
  if (!safePath) return { success: false, error: "path is required" }

  const sourcePath = join(workspaceRoot, safePath)
  if (!existsSync(sourcePath)) {
    return { success: false, error: `Path not found in workspace: ${safePath}` }
  }

  try {
    // Destination: /root/agentr/sites/<tenantId>/<path>
    const destDir = join(SITES_ROOT, tenantId)
    mkdirSync(destDir, { recursive: true })

    const destPath = join(destDir, basename(safePath))

    // Copy file or directory
    try {
      execSync(`cp -r "${sourcePath}" "${destPath}"`, { stdio: "ignore" })
    } catch {
      return { success: false, error: "Failed to copy files to public directory" }
    }

    const isDir = existsSync(destPath) && (await import("fs")).lstatSync(destPath).isDirectory()
    const publicUrl = isDir
      ? `${PUBLIC_BASE}/${tenantId}/${basename(safePath)}/`
      : `${PUBLIC_BASE}/${tenantId}/${basename(safePath)}`

    return {
      success: true,
      data: {
        url: publicUrl,
        message: `Site is live at ${publicUrl}`,
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
