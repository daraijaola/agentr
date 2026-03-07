import type { AgentConfig } from '@agentr/core'
import { AgentRuntime, WalletService, bridgeManager, registerMVPTools } from '@agentr/core'
import { DockerProvisioner } from './docker.js'
import { Database } from './database.js'
import path from 'path'
import { createHash } from 'crypto'

// AgentFactory — provisions and manages agent instances per tenant
// Orchestrates: wallet generation, Docker container, DB records, tool registration

export class AgentFactory {
  private provisioner = new DockerProvisioner()
  private db = new Database()
  private wallet = new WalletService()
  private runtimes = new Map<string, AgentRuntime>()

  async init(): Promise<void> {
    await this.db.init()
    console.log('[AgentFactory] Initialized')
  }

  // Called after OTP verified — full agent provisioning
  async provision(tenantId: string, phone: string): Promise<AgentRuntime> {
    console.log(`[AgentFactory] Provisioning agent for tenant: ${tenantId}`)

    // 1. Generate TON wallet
    const { address, mnemonic } = await this.wallet.generateWallet()
    const mnemonicEnc = this.encryptMnemonic(mnemonic)
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

    // 6. Build agent context
    const config: AgentConfig = {
      tenantId: dbTenantId,
      userId,
      telegramPhone: phone,
      llmProvider: 'anthropic',
      walletAddress: address,
    }

    // 7. Start agent runtime
    const runtime = new AgentRuntime(config, {
      provider: 'anthropic',
      apiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
      model: 'claude-sonnet-4-5',
    })

    // 8. Register MVP tools
    if (tgClient) {
      // TODO: wire SQLite DB per tenant in Phase 2
      // For now pass a minimal stub — tools that need DB will gracefully handle it
      await registerMVPTools(runtime.tools, {
        client: tgClient,
        db: null as never,
        chatId: me?.id.toString() ?? '',
        tenantId: dbTenantId,
      })
    }

    // 9. Start runtime
    await runtime.start()
    this.runtimes.set(dbTenantId, runtime)

    // 10. Update agent status
    await this.db.updateAgentStatus(dbTenantId, 'running')

    console.log(`[AgentFactory] Agent live for tenant: ${dbTenantId}`)
    return runtime
  }

  // Resume agents on API restart
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
          llmProvider: 'anthropic',
          walletAddress: tenant.wallet_address,
        }

        const runtime = new AgentRuntime(config, {
          provider: 'anthropic',
          apiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
          model: 'claude-sonnet-4-5',
        })

        await registerMVPTools(runtime.tools, {
          client: tgClient,
          db: null as never,
          chatId: me?.id.toString() ?? '',
          tenantId: tenant.id,
        })

        await runtime.start()
        this.runtimes.set(tenant.id, runtime)
        console.log(`[AgentFactory] Resumed agent: ${tenant.id}`)
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

  private encryptMnemonic(mnemonic: string[]): string {
    // TODO: proper AES-256 encryption in Phase 2
    // For MVP: base64 encode (NOT production safe — replace before launch)
    return Buffer.from(mnemonic.join(' ')).toString('base64')
  }

  getDb(): Database {
    return this.db
  }
}

// Singleton
export const agentFactory = new AgentFactory()
