/**
 * Session stability layer.
 * - In-memory rate limit: max 10 actions/min per tenant (no Redis dependency).
 * - Health score: 0-100, updated on every success/failure.
 * - Health monitor: pings getMe() every 5 minutes, logs score.
 */

const MAX_ACTIONS_PER_MINUTE = 10
const JITTER_MIN_MS = 4_000
const JITTER_MAX_MS = 12_000

export class SessionManager {
  private actionWindows  = new Map<string, number[]>()          // tenantId → timestamps
  private healthScores   = new Map<string, number>()            // tenantId → 0-100
  private healthTimers   = new Map<string, ReturnType<typeof setInterval>>()

  /** Random jitter in [4, 12] seconds — call before any userbot GramJS action. */
  async jitter(): Promise<void> {
    const ms = JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS)
    await new Promise(r => setTimeout(r, ms))
  }

  /**
   * Returns true if the tenant is within rate limit.
   * Tracking is in-memory sliding 60-second window.
   */
  checkRateLimit(tenantId: string): boolean {
    const now = Date.now()
    const window = (this.actionWindows.get(tenantId) ?? []).filter(t => now - t < 60_000)
    if (window.length >= MAX_ACTIONS_PER_MINUTE) return false
    window.push(now)
    this.actionWindows.set(tenantId, window)
    return true
  }

  recordSuccess(tenantId: string): void {
    const cur = this.healthScores.get(tenantId) ?? 100
    this.healthScores.set(tenantId, Math.min(100, cur + 1))
  }

  recordFailure(tenantId: string): void {
    const cur = this.healthScores.get(tenantId) ?? 100
    this.healthScores.set(tenantId, Math.max(0, cur - 10))
  }

  getHealthScore(tenantId: string): number {
    return this.healthScores.get(tenantId) ?? 100
  }

  /**
   * Start a 5-minute health ping for a tenant.
   * pingFn should call client.getMe() and return true on success.
   * If health drops below 80 a warning is logged.
   */
  startHealthMonitor(tenantId: string, pingFn: () => Promise<boolean>): void {
    if (this.healthTimers.has(tenantId)) return
    const timer = setInterval(async () => {
      try {
        const ok = await pingFn()
        if (ok) this.recordSuccess(tenantId)
        else this.recordFailure(tenantId)
        const score = this.getHealthScore(tenantId)
        console.log(`[SessionManager] Health ${tenantId}: ${ok ? 'ok' : 'fail'} score=${score}`)
        if (score < 80) {
          console.warn(`[SessionManager] Health below 80 for ${tenantId} — consider reconnect`)
        }
      } catch {
        this.recordFailure(tenantId)
      }
    }, 5 * 60 * 1000)
    this.healthTimers.set(tenantId, timer)
  }

  stopHealthMonitor(tenantId: string): void {
    const t = this.healthTimers.get(tenantId)
    if (t) { clearInterval(t); this.healthTimers.delete(tenantId) }
  }
}

export const sessionManager = new SessionManager()
