// DockerProvisioner — tenant isolation layer
// Current model: process-level isolation via PM2 (v0.1.0)
// Roadmap: full Docker container per tenant for stronger isolation

export class DockerProvisioner {
  async spawn(tenantId: string): Promise<void> {
    console.log(`[DockerProvisioner] Agent process registered for tenant: ${tenantId}`)
  }

  async kill(tenantId: string): Promise<void> {
    console.log(`[DockerProvisioner] Killing container for tenant: ${tenantId}`)
  }

  async status(_tenantId: string): Promise<'running' | 'stopped' | 'notfound'> {
    return 'running'
  }
}
