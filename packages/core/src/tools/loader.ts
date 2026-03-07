import { adaptTeletonTools } from './adapter.js'
import type { AdapterContext } from './adapter.js'
import type { ToolRegistry } from '../agent/tool-registry.js'

// MVP tool set — Teleton MIT tools adapted for AGENTR
// Add more tool categories as we progress through phases

export async function registerMVPTools(
  registry: ToolRegistry,
  ctx: AdapterContext
): Promise<void> {
  // -- Telegram: chats
  const { tools: chatTools } = await import('./telegram/teleton/chats/index.js')
  adaptTeletonTools(chatTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: messaging
  const { tools: msgTools } = await import('./telegram/teleton/messaging/index.js')
  adaptTeletonTools(msgTools, ctx).forEach((t) => registry.register(t))

  // -- Telegram: groups
  const { tools: groupTools } = await import('./telegram/teleton/groups/index.js')
  adaptTeletonTools(groupTools, ctx).forEach((t) => registry.register(t))

  // -- TON: wallet + transactions
  const { tools: tonTools } = await import('./ton/teleton/index.js')
  adaptTeletonTools(tonTools, ctx).forEach((t) => registry.register(t))

  // -- Bot creation
  const { tools: botTools } = await import('./bot/teleton/index.js')
  adaptTeletonTools(botTools, ctx).forEach((t) => registry.register(t))

  console.log(`[ToolLoader] Registered ${registry.list().length} tools for tenant: ${ctx.tenantId}`)
}
