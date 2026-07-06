// DockerProvisioner — per-tenant container isolation
// Provides a Docker container per tenant for sandboxed code execution.
// Falls back gracefully when Docker is not available (dev / CI environments).

import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

const SESSIONS_PATH = process.env['SESSIONS_PATH'] ?? '/root/agentr/sessions'
const WORKSPACES_PATH = process.env['WORKSPACES_PATH'] ?? '/root/agentr/workspaces'
const AGENT_IMAGE = process.env['AGENT_IMAGE'] ?? 'agentr-agent:latest'
const MEMORY_LIMIT = process.env['AGENT_CONTAINER_MEMORY'] ?? '512m'
const CPU_LIMIT = process.env['AGENT_CONTAINER_CPUS'] ?? '0.5'
const NETWORK_MODE = process.env['AGENT_CONTAINER_NETWORK'] ?? 'bridge'

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

  private imageExists(): boolean {
    try {
      execFileSync('docker', ['image', 'inspect', AGENT_IMAGE], { stdio: 'ignore', timeout: 3000 })
      return true
    } catch {
      return false
    }
  }

  private ensureImage(): boolean {
    if (this.imageExists()) return true
    const dockerfile = process.env['AGENT_DOCKERFILE'] ?? path.join(process.cwd(), 'Dockerfile.agent')
    if (!existsSync(dockerfile)) {
      console.warn(`[DockerProvisioner] ${dockerfile} not found — cannot build ${AGENT_IMAGE}`)
      return false
    }
    try {
      console.log(`[DockerProvisioner] Building missing image ${AGENT_IMAGE} from ${dockerfile}`)
      execFileSync('docker', ['build', '-f', dockerfile, '-t', AGENT_IMAGE, process.cwd()], {
        stdio: 'inherit',
        timeout: 5 * 60_000,
      })
      return this.imageExists()
    } catch (err) {
      console.warn(`[DockerProvisioner] Failed to build ${AGENT_IMAGE}:`, err)
      return false
    }
  }

  async spawn(tenantId: string): Promise<void> {
    if (!this.docker) {
      console.log(`[DockerProvisioner] (no-docker) Registered tenant: ${tenantId}`)
      return
    }
    if (!this.ensureImage()) {
      console.warn(`[DockerProvisioner] Image ${AGENT_IMAGE} not available — skipping container spawn for tenant: ${tenantId}`)
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
      `--network=${NETWORK_MODE}`,
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--tmpfs=/tmp:size=128m',
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
