import type { AgentConfig } from '@agentr/core'
import { AgentRuntime, WalletService, bridgeManager, registerMVPTools } from '@agentr/core'
import type { LLMProvider } from '@agentr/core'
import { attachMessageListener } from './listener.js'
import { DockerProvisioner } from './docker.js'
import { Database } from './database.js'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import path from 'path'

// ---------------------------------------------------------------------------
// Wallet mnemonic encryption — AES-256-GCM
// Stored format: <iv_hex>:<ciphertext_hex>:<auth_tag_hex>
// Requires WALLET_ENCRYPTION_KEY env var (min 32 chars)
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const raw = process.env['WALLET_ENCRYPTION_KEY']
  if (!raw || raw.length < 32) {
    throw new Error('WALLET_ENCRYPTION_KEY must be set and at least 32 characters long')
  }
  return Buffer.from(raw.slice(0, 32), 'utf8')
}

export function encryptMnemonic(mnemonic: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12) // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(mnemonic, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`
}

export function decryptMnemonic(enc: string): string {
  const key = getEncryptionKey()
  const parts = enc.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted mnemonic format')
  const [ivHex, ciphertextHex, authTagHex] = parts
  const iv = Buffer.from(ivHex!, 'hex')
  const ciphertext = Buffer.from(ciphertextHex!, 'hex')
  const authTag = Buffer.from(authTagHex!, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

export class AgentFactory {
  private provisioner = new DockerProvisioner()
  private db = new Database()
  private wallet = new WalletService()
  private runtimes = new Map<string, AgentRuntime>()

  async init(): Promise<void> {
    await this.db.init()
    console.log('[AgentFactory] Initialized')
  }

  private getLLMConfig(plan?: string, provisionedAt?: number) {
    const provider = (process.env['LLM_PROVIDER'] ?? 'moonshot') as LLMProvider
    const apiKeyMap: Record<LLMProvider, string> = {
      anthropic: process.env['ANTHROPIC_API_KEY'] ?? '',
      openai:    process.env['OPENAI_API_KEY'] ?? '',
      moonshot:  process.env['MOONSHOT_API_KEY'] ?? '',
      'openai-codex': process.env['OPENAI_CODEX_ACCESS_TOKEN'] ?? '',
      air: process.env['OPENAI_API_KEY'] ?? '',
    }
    return {
      provider,
      apiKey: apiKeyMap[provider],
      model: process.env['LLM_MODEL'] ?? undefined,
      plan: (plan ?? 'starter') as 'starter' | 'pro' | 'ultra' | 'elite' | 'enterprise',
      provisionedAt,
    }
  }

  async provision(tenantId: string, phone: string): Promise<AgentRuntime> {
    console.log(`[AgentFactory] Provisioning agent for tenant: ${tenantId}`)

    // 1. Generate TON wallet
    const { address, mnemonic } = await this.wallet.generateWallet()
    // Encrypt mnemonic with AES-256-GCM before storing
    let mnemonicEnc: string
    try {
      mnemonicEnc = encryptMnemonic(mnemonic.join(' '))
    } catch (e) {
      console.warn('[AgentFactory] WALLET_ENCRYPTION_KEY not set, falling back to base64 (insecure):', e)
      mnemonicEnc = Buffer.from(mnemonic.join(' ')).toString('base64')
    }
    console.log(`[AgentFactory] Wallet: ${address}`)

    // 2. Get Telegram user info — start gramjs bridge using Telethon-saved session
    let tgClient = bridgeManager.get(tenantId)
    if (!tgClient) {
      try {
        tgClient = await bridgeManager.resume(tenantId, phone)
        console.log('[AgentFactory] gramjs bridge started for:', tenantId)
      } catch (e) {
        console.warn('[AgentFactory] gramjs bridge failed (no listener):', e)
      }
    }
    const me = tgClient?.getMe()

    // 3. Upsert user in DB
    await this.db.query(
      `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [tenantId]
    )
    let userId = tenantId
    if (me) {
      userId = await this.db.upsertUser({
        telegramId: me.id,
        username: me.username,
        firstName: me.firstName,
      })
    }

    // 4. Create tenant record
    const dbTenantId = tenantId
    await this.db.upsertTenant({
      id: tenantId,
      userId,
      phone,
      walletAddress: address,
      walletMnemonicEnc: mnemonicEnc,
      telegramUserId: me?.id ? BigInt(me.id) : undefined,
      plan: 'starter',
    })

    // 5. Provision Docker container
    await this.provisioner.spawn(dbTenantId)
    await this.db.updateTenantStatus(dbTenantId, 'active')
    await this.db.createAgentInstance(dbTenantId)

    // 6. Fetch plan and provisioned timestamp for LLM config
    const tenantRow = await this.db.getTenant(dbTenantId)
    const plan = tenantRow?.plan ?? 'starter'
    const provisionedAt = tenantRow?.created_at ? new Date(tenantRow.created_at).getTime() : Date.now()

    // 7. Build agent config
    const config: AgentConfig = {
      tenantId: dbTenantId,
      userId,
      telegramPhone: phone,
      llmProvider: this.getLLMConfig(plan, provisionedAt).provider as AgentConfig['llmProvider'],
      walletAddress: address,
      plan: plan as AgentConfig['plan'],
      provisionedAt,
    }

    // 8. Start agent runtime
    const runtime = new AgentRuntime(config, this.getLLMConfig(plan, provisionedAt), {
      deductCredits: (tid, amt, desc, model) => this.db.deductCredits(tid, amt, desc, model).then(() => {})
    })

    // 9. Register MVP tools
    if (tgClient) {
      await registerMVPTools(runtime.tools, {
        client: tgClient,
        db: null as never,
        chatId: me?.id.toString() ?? '',
        tenantId: dbTenantId,
        walletAddress: address,
      })
    }

    if (tgClient) attachMessageListener(dbTenantId, tgClient, runtime)
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
      wallet_mnemonic_enc: string
      plan: string
      created_at: string
    }>(
      `SELECT t.id, t.phone, t.wallet_address, t.wallet_mnemonic_enc, t.plan, t.created_at
       FROM tenants t
       JOIN agent_instances ai ON ai.tenant_id = t.id
       WHERE t.status = 'active' AND ai.status = 'running'`
    )

    console.log(`[AgentFactory] Resuming ${activeTenants.length} active agents...`)

    for (const tenant of activeTenants) {
      try {
        const plan = tenant.plan ?? 'starter'
        const provisionedAt = tenant.created_at ? new Date(tenant.created_at).getTime() : Date.now()

        const tgClient = await bridgeManager.resume(tenant.id, tenant.phone)
        const me = tgClient.getMe()
        const config: AgentConfig = {
          tenantId: tenant.id,
          userId: tenant.id,
          telegramPhone: tenant.phone,
          llmProvider: this.getLLMConfig(plan, provisionedAt).provider as AgentConfig['llmProvider'],
          walletAddress: tenant.wallet_address,
          plan: plan as AgentConfig['plan'],
          provisionedAt,
        }
        const runtime = new AgentRuntime(config, this.getLLMConfig(plan, provisionedAt), {
          deductCredits: (tid, amt, desc, model) => this.db.deductCredits(tid, amt, desc, model).then(() => {})
        })
        await registerMVPTools(runtime.tools, {
          client: tgClient,
          db: null as never,
          chatId: me?.id.toString() ?? '',
          tenantId: tenant.id,
          walletAddress: tenant.wallet_address,
        })
        attachMessageListener(tenant.id, tgClient, runtime)
        this.runtimes.set(tenant.id, runtime)
        console.log(`[AgentFactory] Resumed: ${tenant.id}`)
      } catch (err: any) {
        const msg = String(err)
        if (msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('AUTH_KEY_DUPLICATED') || msg.includes('SESSION_REVOKED')) {
          console.warn(`[AgentFactory] Session expired for ${tenant.id}, clearing`)
          try { const {unlinkSync,existsSync}=await import('fs');const {join}=await import('path');const sf=join(process.env['SESSIONS_PATH'] ?? '/root/agentr/sessions',tenant.id+'.session');if(existsSync(sf))unlinkSync(sf) } catch {}
          await this.db.updateAgentStatus(tenant.id, 'error', msg)
        } else {
          console.error(`[AgentFactory] Failed to resume ${tenant.id}:`, err)
          await this.db.updateAgentStatus(tenant.id, 'error', msg)
        }
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
