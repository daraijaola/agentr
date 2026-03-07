// Docker provisioner  one container per tenant
// Uses dockerode to manage agent containers

export class DockerProvisioner {
  async spawn(tenantId: string): Promise<void> {
    // TODO: dockerode  create + start container for tenantId
    // Mount: sessions/tenantId, workspaces/tenantId, data/tenantId
    console.log(`[DockerProvisioner] Spawning container for tenant: ${tenantId}`)
  }

  async kill(tenantId: string): Promise<void> {
    // TODO: dockerode  stop + remove container for tenantId
    console.log(`[DockerProvisioner] Killing container for tenant: ${tenantId}`)
  }

  async status(tenantId: string): Promise<'running' | 'stopped' | 'notfound'> {
    // TODO: dockerode  inspect container status
    return 'notfound'
  }
}
