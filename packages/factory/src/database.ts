import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Pool } = pg

const __dirname = dirname(fileURLToPath(import.meta.url))

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    pool.on('error', (err) => {
      console.error('[Database] Unexpected pool error:', err)
    })
  }
  return pool
}

export class Database {
  private pool: pg.Pool

  constructor() {
    this.pool = getPool()
  }

  async init(): Promise<void> {
    console.log('[Database] Connecting to PostgreSQL...')
    const client = await this.pool.connect()
    try {
      // Run migrations
      const sql = readFileSync(
        join(__dirname, 'migrations/001_initial.sql'),
        'utf-8'
      )
      await client.query(sql)
      console.log('[Database] Migrations complete')
    } finally {
      client.release()
    }
  }

  //  Users
  async upsertUser(data: {
    telegramId: bigint
    username?: string
    firstName?: string
  }): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE
       SET username = $2, first_name = $3, updated_at = NOW()
       RETURNING id`,
      [data.telegramId, data.username, data.firstName]
    )
    return result.rows[0].id as string
  }

  //  Tenants
  async upsertTenant(data: { id: string; userId: string; phone: string; walletAddress: string; walletMnemonicEnc: string; plan?: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO tenants (id, user_id, phone, wallet_address, wallet_mnemonic_enc, plan)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET user_id = $2, phone = $3, wallet_address = $4, wallet_mnemonic_enc = $5, updated_at = NOW()`,
      [data.id, data.userId, data.phone, data.walletAddress, data.walletMnemonicEnc, data.plan ?? 'starter']
    )
  }

  async createTenant(data: {
    userId: string
    phone: string
    walletAddress: string
    walletMnemonicEnc: string
    plan?: string
  }): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO tenants (user_id, phone, wallet_address, wallet_mnemonic_enc, plan)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [data.userId, data.phone, data.walletAddress, data.walletMnemonicEnc, data.plan ?? 'starter']
    )
    return result.rows[0].id as string
  }

  async getTenantByPhone(phone: string) {
    const result = await this.pool.query(
      `SELECT * FROM tenants WHERE phone = $1`,
      [phone]
    )
    return result.rows[0] ?? null
  }

  async getTenant(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM tenants WHERE id = $1`,
      [id]
    )
    return result.rows[0] ?? null
  }

  async updateTenantStatus(
    id: string,
    status: 'pending' | 'active' | 'suspended' | 'cancelled',
    containerId?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE tenants SET status = $1, container_id = COALESCE($2, container_id), updated_at = NOW()
       WHERE id = $3`,
      [status, containerId ?? null, id]
    )
  }

  //  Agent instances
  async createAgentInstance(tenantId: string): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO agent_instances (tenant_id, status)
       VALUES ($1, 'provisioning')
       RETURNING id`,
      [tenantId]
    )
    return result.rows[0].id as string
  }

  async updateAgentStatus(
    tenantId: string,
    status: 'provisioning' | 'running' | 'stopped' | 'error',
    errorMessage?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE agent_instances
       SET status = $1, error_message = $2, last_active_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $3`,
      [status, errorMessage ?? null, tenantId]
    )
  }

  //  Billing
  async recordBillingEvent(data: {
    tenantId: string
    eventType: string
    amountTon?: number
    txHash?: string
    plan?: string
    validUntil?: Date
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing_events (tenant_id, event_type, amount_ton, tx_hash, plan, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        data.tenantId,
        data.eventType,
        data.amountTon ?? null,
        data.txHash ?? null,
        data.plan ?? null,
        data.validUntil ?? null,
      ]
    )
  }

  async startFreeTrial(tenantId: string): Promise<void> {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await this.pool.query(
      `UPDATE tenants SET trial_expires_at = $1, is_trial_used = true, plan = 'starter', status = 'active' WHERE id = $2`,
      [expires, tenantId]
    )
  }

  async getTrialStatus(tenantId: string): Promise<{ expired: boolean; expiresAt: Date | null; phone: string }> {
    const rows = await this.pool.query(
      `SELECT trial_expires_at, is_trial_used, phone FROM tenants WHERE id = $1`,
      [tenantId]
    )
    const row = rows.rows[0]
    if (!row) return { expired: true, expiresAt: null, phone: '' }
    const expired = row.trial_expires_at ? new Date(row.trial_expires_at) < new Date() : false
    return { expired, expiresAt: row.trial_expires_at, phone: row.phone }
  }

  async blockPhone(phone: string): Promise<void> {
    await this.pool.query(
      `UPDATE tenants SET status = 'suspended' WHERE phone = $1`,
      [phone]
    )
  }

  async isPhoneBlocked(phone: string): Promise<boolean> {
    const rows = await this.pool.query(
      `SELECT status, is_trial_used FROM tenants WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`,
      [phone]
    )
    const row = rows.rows[0]
    if (!row) return false
    return row.status === 'suspended' && row.is_trial_used === true
  }


  async getCredits(tenantId: string): Promise<number> {
    const rows = await this.pool.query(
      'SELECT credits FROM tenants WHERE id = $1',
      [tenantId]
    )
    return rows.rows[0]?.credits ?? 0
  }

  async deductCredits(tenantId: string, amount: number, description: string, model?: string): Promise<{ success: boolean; remaining: number }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const res = await client.query(
        'UPDATE tenants SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits',
        [amount, tenantId]
      )
      if (res.rows.length === 0) {
        await client.query('ROLLBACK')
        const cur = await client.query('SELECT credits FROM tenants WHERE id = $1', [tenantId])
        return { success: false, remaining: cur.rows[0]?.credits ?? 0 }
      }
      await client.query(
        'INSERT INTO credit_transactions (tenant_id, amount, type, description, model) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, -amount, 'usage', description, model ?? null]
      )
      await client.query('COMMIT')
      return { success: true, remaining: res.rows[0].credits }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  async addCredits(tenantId: string, amount: number, description: string): Promise<number> {
    const res = await this.pool.query(
      'UPDATE tenants SET credits = credits + $1 WHERE id = $2 RETURNING credits',
      [amount, tenantId]
    )
    await this.pool.query(
      'INSERT INTO credit_transactions (tenant_id, amount, type, description) VALUES ($1, $2, $3, $4)',
      [tenantId, amount, 'topup', description]
    )
    return res.rows[0]?.credits ?? 0
  }
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params)
    return result.rows as T[]
  }
}
