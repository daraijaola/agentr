// DockerProvisioner — per-tenant container isolation
// Provides a Docker container per tenant for sandboxed code execution.
// Falls back gracefully when Docker is not available (dev / CI environments).

import { execFileSync } from 'child_process'

const SESSIONS_PATH = process.env['SESSIONS_PATH'] ?? '/root/agentr/sessions'
const WORKSPACES_PATH = process.env['WORKSPACES_PATH'] ?? '/root/agentr/workspaces'
const AGENT_IMAGE = process.env['AGENT_IMAGE'] ?? 'agentr-agent:latest'
const MEMORY_LIMIT = process.env['AGENT_CONTAINER_MEMORY'] ?? '512m'
const CPU_LIMIT = process.env['AGENT_CONTAINER_CPUS'] ?? '0.5'

export function containerName(tenantId: string): string {
  return `agentr-${tenantId}`
}

function isDockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 3000 })
    return true
  } catch {
    return false
  }
}

export class DockerProvisioner {
  private dockerAvailable: boolean | null = null

  private get docker(): boolean {
    if (this.dockerAvailable === null) {
      this.dockerAvailable = isDockerAvailable()
      if (!this.dockerAvailable) {
        console.warn('[DockerProvisioner] Docker not available — falling back to host process isolation')
      }
    }
    return this.dockerAvailable
  }

  async spawn(tenantId: string): Promise<void> {
    if (!this.docker) {
      console.log(`[DockerProvisioner] (no-docker) Registered tenant: ${tenantId}`)
      return
    }
    const name = containerName(tenantId)

    // Remove any stopped container with the same name
    try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }) } catch {}

    execFileSync('docker', [
      'run', '-d',
      '--name', name,
      `--memory=${MEMORY_LIMIT}`,
      `--cpus=${CPU_LIMIT}`,
      '--network=none',                           // no outbound internet from sandbox
      '--cap-drop=ALL',                           // drop all Linux capabilities
      '--security-opt=no-new-privileges',
      '--read-only',                              // read-only root FS
      '--tmpfs=/tmp:size=64m',                    // writable /tmp only
      '-v', `${SESSIONS_PATH}/${tenantId}:/workspace:rw`,
      '-v', `${WORKSPACES_PATH}/${tenantId}:/workspace/workspaces:rw`,
      AGENT_IMAGE,
      'sleep', 'infinity',
    ], { stdio: 'ignore' })

    console.log(`[DockerProvisioner] Container started for tenant: ${tenantId}`)
  }

  async kill(tenantId: string): Promise<void> {
    if (!this.docker) {
      console.log(`[DockerProvisioner] (no-docker) Deregistered tenant: ${tenantId}`)
      return
    }
    const name = containerName(tenantId)
    try {
      execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
      console.log(`[DockerProvisioner] Container removed for tenant: ${tenantId}`)
    } catch (err) {
      console.warn(`[DockerProvisioner] Could not remove container ${name}:`, err)
    }
  }

  async status(tenantId: string): Promise<'running' | 'stopped' | 'notfound'> {
    if (!this.docker) return 'running' // assume running in no-docker mode
    const name = containerName(tenantId)
    try {
      const out = execFileSync('docker', ['inspect', '--format={{.State.Status}}', name], { encoding: 'utf8' }).trim()
      if (out === 'running') return 'running'
      return 'stopped'
    } catch {
      return 'notfound'
    }
  }
}
