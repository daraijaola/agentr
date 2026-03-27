import { adaptTools } from './adapter.js'
import type { AdapterContext } from './adapter.js'
import type { ToolRegistry } from '../agent/tool-registry.js'
import { memoryWriteTool } from './memory-write.js'
import { registerListToolsTool } from './list-tools.js'

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

  // -- Telegram: contacts
  const { tools: contactTools } = await import('./telegram/contacts/index.js')
  adaptTools(contactTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: folders
  const { tools: folderTools } = await import('./telegram/folders/index.js')
  adaptTools(folderTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: gifts
  const { tools: giftTools } = await import('./telegram/gifts/index.js')
  adaptTools(giftTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: interactive (polls, quizzes, dice, reactions)
  const { tools: interactiveTools } = await import('./telegram/interactive/index.js')
  adaptTools(interactiveTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: media (photos, voice, video, GIF, stickers, transcribe, vision)
  const { tools: mediaTools } = await import('./telegram/media/index.js')
  adaptTools(mediaTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: profile (bio, username, personal channel)
  const { tools: profileTools } = await import('./telegram/profile/index.js')
  adaptTools(profileTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: stars
  const { tools: starsTools } = await import('./telegram/stars/index.js')
  adaptTools(starsTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: stickers & GIF search
  const { tools: stickerTools } = await import('./telegram/stickers/index.js')
  adaptTools(stickerTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: stories
  const { tools: storyTools } = await import('./telegram/stories/index.js')
  adaptTools(storyTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: scheduled tasks
  const { tools: taskTools } = await import('./telegram/tasks/index.js')
  adaptTools(taskTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: memory (read + write to MEMORY.md)
  const { tools: memTools } = await import('./telegram/memory/index.js')
  adaptTools(memTools, ctx).forEach((t) => {
    if (!registry.has(t.name)) registry.register(t)  // skip duplicate memory_write
  })

  // -- TON: wallet, transactions, jettons, NFTs, DEX
  const { tools: tonTools } = await import('./ton/index.js')
  adaptTools(tonTools, ctx).forEach((t) => registry.register(t))

  // -- DeDust DEX
  const { tools: dedustTools } = await import('./dedust/index.js')
  adaptTools(dedustTools, ctx).forEach((t) => registry.register(t))

  // -- Ston.fi DEX
  const { tools: stonfiTools } = await import('./stonfi/index.js')
  adaptTools(stonfiTools, ctx).forEach((t) => registry.register(t))

  // -- Bot creation
  const { tools: botTools } = await import('./bot/index.js')
  adaptTools(botTools, ctx).forEach((t) => registry.register(t))

  // -- Workspace: file operations (per-tenant sandboxed)
  const { tools: wsTools } = await import('./workspace/index.js')
  adaptTools(wsTools, ctx).forEach((t) => registry.register(t))

  // -- Deploy: exec tools + process management
  const { execRunTool, execRunExecutor, execInstallTool, execInstallExecutor,
          execServiceTool, execServiceExecutor, execStatusTool, execStatusExecutor,
          codeExecuteTool, codeExecuteExecutor } = await import('./deploy/index.js')
  const execTools = [
    { tool: execRunTool, executor: execRunExecutor },
    { tool: execInstallTool, executor: execInstallExecutor },
    { tool: execServiceTool, executor: execServiceExecutor },
    { tool: execStatusTool, executor: execStatusExecutor },
    { tool: codeExecuteTool, executor: codeExecuteExecutor },
  ]
  execTools.forEach(({ tool, executor }) => {
    registry.register({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
      execute: async (params: Record<string, unknown>) => {
        try { return await (executor as Function)(params, { tenantId: ctx.tenantId, walletAddress: ctx.walletAddress }) }
        catch (err) { return { success: false, error: String(err) } }
      },
    })
  })

  // -- Durable memory writes to MEMORY.md (top-level; telegram/memory has read+write)
  if (!registry.has(memoryWriteTool.name)) {
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
  }

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

  // -- Test runner
  const { runTestTool, runTestExecutor } = await import('./deploy/run-test.js')
  registry.register({
    name: runTestTool.name,
    description: runTestTool.description,
    parameters: runTestTool.parameters as Record<string, unknown>,
    execute: async (params) => runTestExecutor(params as never, { tenantId: ctx.tenantId }),
  })

  // -- Built-in: list all tools (always last so count is accurate)
  registerListToolsTool(registry)

  console.log(`[ToolLoader] Registered ${registry.list().length} tools for tenant: ${ctx.tenantId}`)
}
