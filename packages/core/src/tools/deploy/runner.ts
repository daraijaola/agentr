import { spawn, type SpawnOptions } from 'child_process'
import { execFileSync } from 'child_process'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('Exec')
const KILL_GRACE_MS = 5000

export interface ExecResult {
  stdout: string; stderr: string; exitCode: number | null
  signal: string | null; duration: number; truncated: boolean; timedOut: boolean
}
export interface RunOptions { timeout?: number; maxOutput?: number }

// Returns the name of the tenant's Docker sandbox container
function tenantContainer(tenantId: string): string { return `agentr-${tenantId}` }

// True if the container is running — checked once per call (fast inspect)
function containerRunning(tenantId: string): boolean {
  try {
    const out = execFileSync(
      'docker', ['inspect', '--format={{.State.Status}}', tenantContainer(tenantId)],
      { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
    return out === 'running'
  } catch { return false }
}

// Run an arbitrary bash command.
// When tenantId is supplied and the tenant's Docker container is running,
// the command executes inside the sandbox (docker exec) instead of on the host.
export function runCommand(command: string, options: RunOptions = {}, tenantId?: string): Promise<ExecResult> {
  const timeout = options.timeout ?? 30_000
  const maxOutput = options.maxOutput ?? 50_000
  const startTime = Date.now()

  const useDocker = !!tenantId && containerRunning(tenantId)
  const spawnArgs: [string, string[]] = useDocker
    ? ['docker', ['exec', '--interactive=false', tenantContainer(tenantId!), 'bash', '-c', command]]
    : ['bash', ['-c', command]]

  return new Promise((resolve) => {
    let stdout = '', stderr = '', truncated = false, timedOut = false, resolved = false

    const child = spawn(spawnArgs[0], spawnArgs[1], {
      detached: !useDocker, // docker exec cannot be detached by process group
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    } as SpawnOptions & { encoding: string })

    const finish = (exitCode: number | null, signal: string | null) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      resolve({ stdout, stderr, exitCode, signal, duration: Date.now() - startTime, truncated, timedOut })
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < maxOutput) { stdout += chunk; if (stdout.length > maxOutput) { stdout = stdout.slice(0, maxOutput); truncated = true } }
    })
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < maxOutput) { stderr += chunk; if (stderr.length > maxOutput) { stderr = stderr.slice(0, maxOutput); truncated = true } }
    })
    child.on('close', (code, sig) => finish(code, sig))
    child.on('error', (err) => { log.error({ err }, 'Spawn error'); stderr += err.message; finish(1, null) })

    let killTimer: ReturnType<typeof setTimeout>
    const timeoutTimer = setTimeout(() => {
      timedOut = true
      if (!useDocker && child.pid) {
        try { process.kill(-child.pid, 'SIGTERM') } catch {}
        killTimer = setTimeout(() => {
          if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
        }, KILL_GRACE_MS)
      } else {
        child.kill('SIGTERM')
        killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
      }
    }, timeout)
  })
}
