import { Type } from "@sinclair/typebox"
import { execSync, execFileSync } from "child_process"
import type { Tool, ToolExecutor, ToolResult } from "../types.js"

const PUBLIC_BASE = "https://agentr.online/sites"

// Allow only safe filename characters — prevents shell injection in curl probe
function sanitizeFilename(filename: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(filename) || filename.includes('..')) {
    throw new Error(`Invalid filename: "${filename}"`)
  }
  return filename
}

export const serveStaticTool: Tool = {
  name: "serve_static",
  description: "Serve a static HTML file or folder publicly. Give the filename in the tenant workspace and get back a public URL.",
  parameters: Type.Object({
    filename: Type.String({ description: "HTML file to serve, e.g. index.html" }),
    port: Type.Optional(Type.Number({ description: "Port to use (default 8080)" })),
  }),
}

export const serveStaticExecutor: ToolExecutor<{ filename: string; port?: number }> = async (params, context): Promise<ToolResult> => {
  const { port = 8080 } = params
  let filename: string
  try { filename = sanitizeFilename(params.filename) } catch (err) { return { success: false, error: String(err) } }
  const safePort = Math.floor(port) // ensure integer
  const tenantId = context.tenantId
  const dir = `${process.env["SESSIONS_PATH"] ?? "/root/agentr/sessions"}/${tenantId}`

  try {
    // Kill any existing server on this port
    try { execSync(`fuser -k ${safePort}/tcp 2>/dev/null`, { stdio: 'ignore' }) } catch {}

    // Start fresh — dir is derived from UUID tenantId, safe to use in shell
    execSync(`cd ${dir} && nohup python3 -m http.server ${safePort} > /tmp/static-${tenantId}.log 2>&1 &`, { shell: '/bin/bash' })

    // Wait and verify — use execFileSync to avoid shell injection from filename
    await new Promise(r => setTimeout(r, 1500))
    execFileSync('curl', ['-sf', `http://localhost:${safePort}/${filename}`], { stdio: 'ignore' })

    const publicUrl = `${PUBLIC_BASE}/${filename}`
    return { success: true, data: { url: publicUrl, port: safePort, message: `Site live at ${publicUrl}` } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
