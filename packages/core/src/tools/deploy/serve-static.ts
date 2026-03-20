import { Type } from "@sinclair/typebox"
import { execSync } from "child_process"
import type { Tool, ToolExecutor, ToolResult } from "../../types.js"

const PUBLIC_BASE = "https://agentr.online/sites"

export const serveStaticTool: Tool = {
  name: "serve_static",
  description: "Serve a static HTML file or folder publicly. Give the filename in the tenant workspace and get back a public URL.",
  parameters: Type.Object({
    filename: Type.String({ description: "HTML file to serve, e.g. index.html" }),
    port: Type.Optional(Type.Number({ description: "Port to use (default 8080)" })),
  }),
}

export const serveStaticExecutor: ToolExecutor<{ filename: string; port?: number }> = async (params, context): Promise<ToolResult> => {
  const { filename, port = 8080 } = params
  const tenantId = context.tenantId
  const dir = `/root/agentr/sessions/${tenantId}`

  try {
    // Kill any existing server on this port
    try { execSync(`fuser -k ${port}/tcp 2>/dev/null`, { stdio: 'ignore' }) } catch {}
    
    // Start fresh
    execSync(`cd ${dir} && nohup python3 -m http.server ${port} > /tmp/static-${tenantId}.log 2>&1 &`, { shell: '/bin/bash' })
    
    // Wait and verify
    await new Promise(r => setTimeout(r, 1500))
    execSync(`curl -sf http://localhost:${port}/${filename}`, { stdio: 'ignore' })

    const publicUrl = `${PUBLIC_BASE}/${filename}`
    return { success: true, data: { url: publicUrl, port, message: `Site live at ${publicUrl}` } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
