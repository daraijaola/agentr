import type { AgentContext, AgentConfig } from '@agentr/core'
import { AgentRuntime, WalletService } from '@agentr/core'
import { DockerProvisioner } from './docker.js'
import { Database } from './database.js'
import path from 'path'

export class AgentFactory {
  private provisioner = new DockerProvisioner()
  private db = new Database()
  private wallet = new WalletService()
  private agents = new Map<string, AgentRuntime>()

  async provision(config: AgentConfig): Promise<AgentRuntime> {
    // 1. Generate TON wallet
    const { address, mnemonic } = await this.wallet.generateWallet()
    console.log(`[AgentFactory] Wallet generated: ${address}`)

    // 2. Provision Docker container
    await this.provisioner.spawn(config.tenantId)

    // 3. Build agent context
    const context: AgentContext = {
      config: { ...config, walletAddress: address },
      sessionPath: path.join('sessions', config.tenantId),
      workspacePath: path.join('workspaces', config.tenantId),
      dbPath: path.join('data', config.tenantId, 'agent.db'),
    }

    // 4. Start agent runtime
    const runtime = new AgentRuntime(context)
    await runtime.start()

    // 5. Store in memory map
    this.agents.set(config.tenantId, runtime)

    console.log(`[AgentFactory] Agent provisioned for tenant: ${config.tenantId}`)
    return runtime
  }

  get(tenantId: string): AgentRuntime | undefined {
    return this.agents.get(tenantId)
  }

  async deprovision(tenantId: string): Promise<void> {
    const runtime = this.agents.get(tenantId)
    if (runtime) {
      await runtime.stop()
      this.agents.delete(tenantId)
    }
    await this.provisioner.kill(tenantId)
    console.log(`[AgentFactory] Agent deprovisioned: ${tenantId}`)
  }
}
