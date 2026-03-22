import { adaptTools } from './adapter.js'
import type { AdapterContext } from './adapter.js'
import type { ToolRegistry } from '../agent/tool-registry.js'
import { memoryWriteTool } from './memory-write.js'

// AGENTR MVP tool set
export async function registerMVPTools(
  registry: ToolRegistry,
  ctx: AdapterContext
): Promise<void> {
  // -- Telegram: chats
  const { tools: chatTools } = await import('./telegram/chats/index.js')
  adaptTools(chatTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: messaging
  const { tools: msgTools } = await import('./telegram/messaging/index.js')
  adaptTools(msgTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: groups
  const { tools: groupTools } = await import('./telegram/groups/index.js')
  adaptTools(groupTools, ctx).forEach((t) => registry.register(t))

  // -- TON: wallet + transactions
  const { tools: tonTools } = await import('./ton/index.js')
  adaptTools(tonTools, ctx).forEach((t) => registry.register(t))

  // -- Bot creation
  const { tools: botTools } = await import('./bot/index.js')
  adaptTools(botTools, ctx).forEach((t) => registry.register(t))

  // -- Workspace: file operations (per-tenant sandboxed)
  const { tools: wsTools } = await import('./workspace/index.js')
  adaptTools(wsTools, ctx).forEach((t) => registry.register(t))

  // -- Deploy: code_execute + process management
  const { tools: deployTools } = await import('./deploy/index.js')
  deployTools.forEach((entry) => {
    registry.register({
      name: entry.tool.name,
      description: entry.tool.description,
      parameters: entry.tool.parameters as Record<string, unknown>,
      execute: async (params: Record<string, unknown>) => {
        try {
          return await (entry.executor as Function)(params, {
            tenantId: ctx.tenantId,
            walletAddress: ctx.walletAddress,
          })
        } catch (err) {
          return { success: false, error: String(err) }
        }
      },
    })
  })

  // -- Durable memory writes to MEMORY.md
  registry.register({
    name: memoryWriteTool.name,
    description: memoryWriteTool.description,
    parameters: memoryWriteTool.parameters,
    execute: async (params: Record<string, unknown>) => {
      return memoryWriteTool.execute(params as { content: string; mode: 'append' | 'overwrite' }, {
        tenantId: ctx.tenantId,
      })
    },
  })

  // -- DNS: .ton domain tools
  const { tools: dnsTools } = await import('./dns/index.js')
  adaptTools(dnsTools, ctx).forEach((t) => registry.register(t))

  // -- Swarm: multi sub-agent execution
  const { tools: swarmTools } = await import('./swarm/index.js')
  swarmTools.forEach((entry) => {
    registry.register({
      name: entry.tool.name,
      description: entry.tool.description,
      parameters: entry.tool.parameters as Record<string, unknown>,
      execute: async (params: Record<string, unknown>) => {
        try {
          return await (entry.executor as Function)(params, { tenantId: ctx.tenantId })
        } catch (err) {
          return { success: false, error: String(err) }
        }
      },
    })
  })


  // -- Serve static files publicly
  const { serveStaticTool, serveStaticExecutor } = await import('./deploy/serve-static.js')
  registry.register({
    name: serveStaticTool.name,
    description: serveStaticTool.description,
    parameters: serveStaticTool.parameters as Record<string, unknown>,
    execute: async (params) => serveStaticExecutor(params as never, { tenantId: ctx.tenantId }),
  })
  console.log(`[ToolLoader] Registered ${registry.list().length} tools for tenant: ${ctx.tenantId}`)
}
