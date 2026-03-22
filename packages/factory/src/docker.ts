// Docker provisioner — manages per-tenant agent containers
// Container orchestration is handled via PM2 in the current deployment model

export class DockerProvisioner {
  async spawn(tenantId: string): Promise<void> {
    console.log(`[DockerProvisioner] Spawning container for tenant: ${tenantId}`)
  }

  async kill(tenantId: string): Promise<void> {
    console.log(`[DockerProvisioner] Killing container for tenant: ${tenantId}`)
  }

  async status(_tenantId: string): Promise<'running' | 'stopped' | 'notfound'> {
    return 'notfound'
  }
}
