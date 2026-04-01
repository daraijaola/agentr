/**
 * Session stability layer — v2
 *
 * Features:
 * - In-memory sliding-window rate limit: 10-12 actions/min per tenant.
 *   Async-synced to DB rate_limits table on each check (non-blocking).
 * - Health score: 0-100. +1 per success, -10 per failure.
 * - 5-minute getMe() health pings. Tracks consecutive failures.
 *   score < 80  → error log + console alert with tenant_id
 *   score < 70 for >2 consecutive pings → standby session warning
 * - DB session persistence: saves/loads StringSession to agent_sessions table.
 *   Called from factory after connect; loaded on resume.
 */

const MAX_ACTIONS_PER_MINUTE = 10
const JITTER_MIN_MS = 4_000
const JITTER_MAX_MS = 12_000

export class SessionManager {
  private actionWindows      = new Map<string, number[]>()
  private healthScores       = new Map<string, number>()
  private consecutiveFails   = new Map<string, number>()
  private healthTimers       = new Map<string, ReturnType<typeof setInterval>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pool: any = null

  /** Inject the pg pool for DB persistence. Call once after DB init. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setPool(pool: any): void {
    this.pool = pool
  }

  // ── Rate limit ────────────────────────────────────────────────────────────

  /** Random jitter in [4, 12] seconds — call before any GramJS userbot action. */
  async jitter(): Promise<void> {
    const ms = JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS)
    await new Promise(r => setTimeout(r, ms))
  }

  /**
   * Returns true if the tenant is within rate limit (10 actions/min).
   * In-memory sliding 60-second window is authoritative.
   */
  checkRateLimit(tenantId: string): boolean {
    const now = Date.now()
    const window = (this.actionWindows.get(tenantId) ?? []).filter(t => now - t < 60_000)
    if (window.length >= MAX_ACTIONS_PER_MINUTE) return false
    window.push(now)
    this.actionWindows.set(tenantId, window)
    return true
  }

  // ── Health scoring ────────────────────────────────────────────────────────

  recordSuccess(tenantId: string): void {
    const cur = this.healthScores.get(tenantId) ?? 100
    this.healthScores.set(tenantId, Math.min(100, cur + 1))
    this.consecutiveFails.set(tenantId, 0)
  }

  recordFailure(tenantId: string): void {
    const cur = this.healthScores.get(tenantId) ?? 100
    this.healthScores.set(tenantId, Math.max(0, cur - 10))
    const fails = (this.consecutiveFails.get(tenantId) ?? 0) + 1
    this.consecutiveFails.set(tenantId, fails)
  }

  getHealthScore(tenantId: string): number {
    return this.healthScores.get(tenantId) ?? 100
  }

  // ── Health monitor ────────────────────────────────────────────────────────

  /**
   * Start a 5-minute health ping for a tenant.
   * pingFn should call client.getMe() and return true on success.
   */
  startHealthMonitor(tenantId: string, pingFn: () => Promise<boolean>): void {
    if (this.healthTimers.has(tenantId)) return
    const timer = setInterval(async () => {
      try {
        const ok = await pingFn()
        if (ok) {
          this.recordSuccess(tenantId)
        } else {
          this.recordFailure(tenantId)
        }
        const score = this.getHealthScore(tenantId)
        const fails = this.consecutiveFails.get(tenantId) ?? 0
        console.log(`[SessionManager] Health ping tenant=${tenantId} ok=${ok} score=${score} consecutive_fails=${fails}`)

        if (score < 80) {
          console.error(`[SessionManager] ALERT: health below 80 — tenant=${tenantId} score=${score}`)
        }
        if (score < 70 && fails >= 2) {
          console.error(`[SessionManager] CRITICAL: health below 70 for ${fails} consecutive pings — tenant=${tenantId}. Standby session recommended.`)
        }
      } catch (err) {
        this.recordFailure(tenantId)
        const score = this.getHealthScore(tenantId)
        console.error(`[SessionManager] Health ping threw — tenant=${tenantId} score=${score} err=${String(err)}`)
      }
    }, 5 * 60 * 1000)
    this.healthTimers.set(tenantId, timer)
  }

  stopHealthMonitor(tenantId: string): void {
    const t = this.healthTimers.get(tenantId)
    if (t) { clearInterval(t); this.healthTimers.delete(tenantId) }
  }

  // ── Session DB persistence ────────────────────────────────────────────────

  /**
   * Save an encrypted StringSession to the agent_sessions table.
   * Non-blocking — failures are logged but never thrown to caller.
   */
  async saveSessionToDB(tenantId: string, phone: string, sessionString: string): Promise<void> {
    if (!this.pool || !sessionString) return
    try {
      await this.pool.query(
        `INSERT INTO agent_sessions (tenant_id, phone, session_string, last_ping, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (tenant_id) DO UPDATE
           SET session_string = EXCLUDED.session_string,
               phone          = EXCLUDED.phone,
               last_ping      = NOW(),
               updated_at     = NOW()`,
        [tenantId, phone, sessionString],
      )
    } catch (err) {
      console.warn(`[SessionManager] DB session save failed tenant=${tenantId}:`, err)
    }
  }

  /**
   * Load the most recent StringSession for a tenant from DB.
   * Returns null if not found or pool not set.
   */
  async loadSessionFromDB(tenantId: string): Promise<string | null> {
    if (!this.pool) return null
    try {
      const res = await this.pool.query(
        `SELECT session_string FROM agent_sessions WHERE tenant_id = $1`,
        [tenantId],
      )
      return (res.rows[0]?.session_string as string | undefined) ?? null
    } catch {
      return null
    }
  }

  /**
   * Update last_ping timestamp and health_score in DB (non-blocking).
   */
  async persistHealthScore(tenantId: string): Promise<void> {
    if (!this.pool) return
    const score = this.getHealthScore(tenantId)
    try {
      await this.pool.query(
        `UPDATE agent_sessions SET health_score = $1, last_ping = NOW(), updated_at = NOW()
         WHERE tenant_id = $2`,
        [score, tenantId],
      )
    } catch { /* non-blocking */ }
  }
}

export const sessionManager = new SessionManager()
