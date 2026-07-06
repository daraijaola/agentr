import { Type } from "@sinclair/typebox"
import { existsSync, rmSync } from "fs"
import { join, basename } from "path"
import type { Tool, ToolExecutor, ToolResult } from "../types.js"

export const deleteSiteTool: Tool = {
  name: "delete_site",
  description: "Remove a published file or folder from the public web server, making it no longer accessible. Pass the path relative to the workspace root that was previously published with serve_static (e.g. 'index.html' or 'mysite/'). To wipe the entire tenant site, pass path='.'.",
  parameters: Type.Object({
    path: Type.String({ description: "File or directory path that was published via serve_static, e.g. 'index.html' or 'mysite/'. Use '.' to delete everything for this tenant." }),
  }),
}

export const deleteSiteExecutor: ToolExecutor<{ path: string }> = async (params, context): Promise<ToolResult> => {
  const tenantId = context.tenantId
  const sitesRoot = process.env["SITES_PATH"] ?? "/var/www/agentr-sites"

  const safePath = params.path.replace(/\.\./g, "").replace(/^\/+/, "").trim()
  if (!safePath) return { success: false, error: "path is required" }

  const tenantDir = join(sitesRoot, tenantId)

  try {
    if (safePath === ".") {
      if (!existsSync(tenantDir)) {
        return { success: false, error: "No published site found for this agent." }
      }
      rmSync(tenantDir, { recursive: true, force: true })
      return { success: true, data: { deleted: tenantDir, message: "All published site files removed." } }
    }

    const targetPath = join(tenantDir, basename(safePath))
    if (!existsSync(targetPath)) {
      return { success: false, error: `Published path not found: ${safePath}` }
    }

    rmSync(targetPath, { recursive: true, force: true })
    return {
      success: true,
      data: {
        deleted: basename(safePath),
        message: `"${basename(safePath)}" has been removed from the public server.`,
      },
    }
  } catch (err) {
    return { success: false, error: `Failed to delete: ${String(err)}` }
  }
}
