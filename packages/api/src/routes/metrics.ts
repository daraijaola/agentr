import { Hono } from 'hono'
import { getPool } from '@agentr/factory'

export const metricsRoutes = new Hono()

const startedAt = Date.now()

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function isAdmin(c: any): boolean {
  const key =
    c.req.header('x-admin-key') ??
    c.req.query('key') ??
    ''
  const expected = process.env['ADMIN_KEY'] ?? process.env['API_SECRET'] ?? ''
  return !!expected && key === expected
}

// GET /metrics  — operational dashboard (protected by x-admin-key header)
metricsRoutes.get('/', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Forbidden — set x-admin-key header' }, 403)

  const pool = getPool()
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000)

  const [tenantRes, msgRes, creditSpendRes, sessionRes, modelRes, rateLimitRes] =
    await Promise.allSettled([
      // 1. Tenant counts by plan
      pool.query(`
        SELECT
          COUNT(*)::int                                                  AS total,
          COUNT(CASE WHEN plan = 'free'        THEN 1 END)::int         AS free,
          COUNT(CASE WHEN plan = 'starter'     THEN 1 END)::int         AS starter,
          COUNT(CASE WHEN plan = 'pro'         THEN 1 END)::int         AS pro,
          COUNT(CASE WHEN plan = 'ultra'       THEN 1 END)::int         AS ultra,
          COUNT(CASE WHEN plan = 'elite'       THEN 1 END)::int         AS elite,
          COUNT(CASE WHEN plan = 'enterprise'  THEN 1 END)::int         AS enterprise,
          COUNT(CASE WHEN credits <= 0         THEN 1 END)::int         AS zero_credits,
          COUNT(CASE WHEN credits > 0
                      AND credits <= 20        THEN 1 END)::int         AS low_credits,
          ROUND(AVG(credits))::int                                       AS avg_credits
        FROM tenants
      `),

      // 2. Messages in last 24 h + 1 h
      pool.query(`
        SELECT
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int AS last_24h,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour'   THEN 1 END)::int AS last_1h
        FROM agent_messages
      `),

      // 3. Credit spend in last 24 h
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)::int AS credits_spent_24h,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount       ELSE 0 END), 0)::int AS credits_added_24h,
          COUNT(*)::int                                                             AS tx_count_24h
        FROM credit_transactions
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `),

      // 4. Session health — all tenants, sorted worst-first
      pool.query(`
        SELECT
          t.phone,
          s.health_score,
          s.consecutive_fails,
          s.last_ping,
          s.updated_at
        FROM agent_sessions s
        JOIN tenants t ON t.id = s.tenant_id
        ORDER BY s.health_score ASC
      `),

      // 5. Model distribution
      pool.query(`
        SELECT preferred_model AS model, COUNT(*)::int AS tenants
        FROM tenants
        GROUP BY preferred_model
        ORDER BY tenants DESC
      `),

      // 6. Rate limit hits in last hour (IPs that hit the ceiling)
      pool.query(`
        SELECT COUNT(*)::int AS rate_limited_ips
        FROM rate_limits
        WHERE count >= 60 AND reset_at > $1
      `, [Date.now()]),
    ])

  const sessions =
    sessionRes.status === 'fulfilled'
      ? sessionRes.value.rows.map((r: any) => ({
          phone: r.phone?.slice(0, 7) + '…',
          score: r.health_score,
          consecutive_fails: r.consecutive_fails,
          last_ping: r.last_ping,
        }))
      : []

  const healthy   = sessions.filter((s: any) => s.score >= 80).length
  const degraded  = sessions.filter((s: any) => s.score >= 60 && s.score < 80).length
  const critical  = sessions.filter((s: any) => s.score < 60).length

  return c.json({
    uptime: {
      seconds: uptimeSec,
      human:   formatUptime(uptimeSec),
      since:   new Date(Date.now() - uptimeSec * 1000).toISOString(),
    },
    tenants:
      tenantRes.status === 'fulfilled'
        ? tenantRes.value.rows[0]
        : null,
    messages:
      msgRes.status === 'fulfilled'
        ? msgRes.value.rows[0]
        : null,
    credits:
      creditSpendRes.status === 'fulfilled'
        ? creditSpendRes.value.rows[0]
        : null,
    session_health: {
      healthy,
      degraded,
      critical,
      total: sessions.length,
      worst: sessions.slice(0, 5),
    },
    model_distribution:
      modelRes.status === 'fulfilled'
        ? modelRes.value.rows
        : [],
    rate_limits:
      rateLimitRes.status === 'fulfilled'
        ? rateLimitRes.value.rows[0]
        : null,
    timestamp: new Date().toISOString(),
  })
})
