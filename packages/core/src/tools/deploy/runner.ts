import { spawn, type SpawnOptions } from 'child_process'
import { createLogger } from '../../utils/logger.js'
const log = createLogger('Exec')
const KILL_GRACE_MS = 5000
export interface ExecResult { stdout: string; stderr: string; exitCode: number | null; signal: string | null; duration: number; truncated: boolean; timedOut: boolean }
export interface RunOptions { timeout?: number; maxOutput?: number }
export function runCommand(command: string, options: RunOptions = {}): Promise<ExecResult> {
  const timeout = options.timeout ?? 30_000
  const maxOutput = options.maxOutput ?? 50_000
  const startTime = Date.now()
  return new Promise((resolve) => {
    let stdout = '', stderr = '', truncated = false, timedOut = false, resolved = false
    const child = spawn('bash', ['-c', command], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' } as SpawnOptions & { encoding: string })
    const finish = (exitCode: number | null, signal: string | null) => {
      if (resolved) return; resolved = true; clearTimeout(timeoutTimer); clearTimeout(killTimer)
      resolve({ stdout, stderr, exitCode, signal, duration: Date.now() - startTime, truncated, timedOut })
    }
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => { if (stdout.length < maxOutput) { stdout += chunk; if (stdout.length > maxOutput) { stdout = stdout.slice(0, maxOutput); truncated = true } } })
    child.stderr?.on('data', (chunk: string) => { if (stderr.length < maxOutput) { stderr += chunk; if (stderr.length > maxOutput) { stderr = stderr.slice(0, maxOutput); truncated = true } } })
    child.on('close', (code, sig) => finish(code, sig))
    child.on('error', (err) => { log.error({ err }, 'Spawn error'); stderr += err.message; finish(1, null) })
    let killTimer: ReturnType<typeof setTimeout>
    const timeoutTimer = setTimeout(() => {
      timedOut = true
      if (child.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch {} }
      killTimer = setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} } }, KILL_GRACE_MS)
    }, timeout)
  })
}
