import type { AgentConfig } from '@agentr/core'
import { AgentRuntime, WalletService, bridgeManager, registerMVPTools } from '@agentr/core'
import type { LLMProvider } from '@agentr/core'
import { DockerProvisioner } from './docker.js'
import { Database } from './database.js'
import path from 'path'

export class AgentFactory {
  private provisioner = new DockerProvisioner()
  private db = new Database()
  private wallet = new WalletService()
  private runtimes = new Map<string, AgentRuntime>()

  async init(): Promise<void> {
    await this.db.init()
    console.log('[AgentFactory] Initialized')
  }

  private getLLMConfig() {
    const provider = (process.env['LLM_PROVIDER'] ?? 'moonshot') as LLMProvider
    const apiKeyMap: Record<LLMProvider, string> = {
      anthropic: process.env['ANTHROPIC_API_KEY'] ?? '',
      openai:    process.env['OPENAI_API_KEY'] ?? '',
      moonshot:  process.env['MOONSHOT_API_KEY'] ?? '',
    }
    return {
      provider,
      apiKey: apiKeyMap[provider],
      model: process.env['LLM_MODEL'] ?? undefined,
    }
  }

  async provision(tenantId: string, phone: string): Promise<AgentRuntime> {
    console.log(`[AgentFactory] Provisioning agent for tenant: ${tenantId}`)

    // 1. Generate TON wallet
    const { address, mnemonic } = await this.wallet.generateWallet()
    const mnemonicEnc = Buffer.from(mnemonic.join(' ')).toString('base64')
    console.log(`[AgentFactory] Wallet: ${address}`)

    // 2. Get Telegram user info
    const tgClient = bridgeManager.get(tenantId)
    const me = tgClient?.getMe()

    // 3. Upsert user in DB
    let userId = tenantId
    if (me) {
      userId = await this.db.upsertUser({
        telegramId: me.id,
        username: me.username,
        firstName: me.firstName,
      })
    }

    // 4. Create tenant record
    const dbTenantId = await this.db.createTenant({
      userId,
      phone,
      walletAddress: address,
      walletMnemonicEnc: mnemonicEnc,
      plan: 'starter',
    })

    // 5. Provision Docker container
    await this.provisioner.spawn(dbTenantId)
    await this.db.updateTenantStatus(dbTenantId, 'active')
    await this.db.createAgentInstance(dbTenantId)

    // 6. Build agent config
    const config: AgentConfig = {
      tenantId: dbTenantId,
      userId,
      telegramPhone: phone,
      llmProvider: this.getLLMConfig().provider,
      walletAddress: address,
    }

    // 7. Start agent runtime
    const runtime = new AgentRuntime(config, this.getLLMConfig())

    // 8. Register MVP tools
    if (tgClient) {
      await registerMVPTools(runtime.tools, {
        client: tgClient,
        db: null as never,
        chatId: me?.id.toString() ?? '',
        tenantId: dbTenantId,
      })
    }

    // runtime.start() — not needed
    this.runtimes.set(dbTenantId, runtime)
    await this.db.updateAgentStatus(dbTenantId, 'running')

    console.log(`[AgentFactory] Agent live for tenant: ${dbTenantId}`)
    return runtime
  }

  async resumeAll(): Promise<void> {
    const activeTenants = await this.db.query<{
      id: string
      phone: string
      wallet_address: string
    }>(
      `SELECT t.id, t.phone, t.wallet_address
       FROM tenants t
       JOIN agent_instances ai ON ai.tenant_id = t.id
       WHERE t.status = 'active' AND ai.status = 'running'`
    )

    console.log(`[AgentFactory] Resuming ${activeTenants.length} active agents...`)

    for (const tenant of activeTenants) {
      try {
        const tgClient = await bridgeManager.resume(tenant.id, tenant.phone)
        const me = tgClient.getMe()
        const config: AgentConfig = {
          tenantId: tenant.id,
          userId: tenant.id,
          telegramPhone: tenant.phone,
          llmProvider: this.getLLMConfig().provider,
          walletAddress: tenant.wallet_address,
        }
        const runtime = new AgentRuntime(config, this.getLLMConfig())
        await registerMVPTools(runtime.tools, {
          client: tgClient,
          db: null as never,
          chatId: me?.id.toString() ?? '',
          tenantId: tenant.id,
        })
        // runtime.start() — not needed
        this.runtimes.set(tenant.id, runtime)
        console.log(`[AgentFactory] Resumed: ${tenant.id}`)
      } catch (err) {
        console.error(`[AgentFactory] Failed to resume ${tenant.id}:`, err)
        await this.db.updateAgentStatus(tenant.id, 'error', String(err))
      }
    }
  }

  get(tenantId: string): AgentRuntime | undefined {
    return this.runtimes.get(tenantId)
  }

  async deprovision(tenantId: string): Promise<void> {
    const runtime = this.runtimes.get(tenantId)
    if (runtime) {
      await runtime.stop()
      this.runtimes.delete(tenantId)
    }
    await bridgeManager.disconnect(tenantId)
    await this.provisioner.kill(tenantId)
    await this.db.updateTenantStatus(tenantId, 'cancelled')
    await this.db.updateAgentStatus(tenantId, 'stopped')
    console.log(`[AgentFactory] Deprovisioned: ${tenantId}`)
  }

  getDb(): Database { return this.db }
}

export const agentFactory = new AgentFactory()
