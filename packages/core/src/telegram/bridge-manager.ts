import { TelegramUserClient } from './client.js'
import type { TelegramClientConfig, OtpRequest } from './client.js'
import { mkdirSync } from 'fs'
import path from 'path'

export class TelegramBridgeManager {
  private clients = new Map<string, TelegramUserClient>()
  private sessionsDir: string

  constructor(sessionsDir = 'sessions') {
    this.sessionsDir = sessionsDir
    mkdirSync(sessionsDir, { recursive: true })
  }

  private getSessionPath(tenantId: string): string {
    return path.join(this.sessionsDir, `${tenantId}.session`)
  }

  private makeConfig(tenantId: string, phone: string): TelegramClientConfig {
    return {
      tenantId,
      apiId: Number(process.env['TELEGRAM_API_ID'] ?? '10213775'),
      apiHash: process.env['TELEGRAM_API_HASH'] ?? '10177b03e1db0f6d99e2e2f3f8ed9450',
      phone,
      sessionPath: this.getSessionPath(tenantId),
    }
  }

  async requestOtp(tenantId: string, phone: string): Promise<OtpRequest> {
    const config = this.makeConfig(tenantId, phone)
    const client = new TelegramUserClient(config)
    this.clients.set(tenantId, client)
    return client.requestOtp()
  }

  async verifyOtp(tenantId: string, phoneCodeHash: string, code: string): Promise<boolean> {
    const client = this.clients.get(tenantId)
    if (!client) throw new Error(`No pending auth for tenant: ${tenantId}`)
    const ok = await client.verifyOtp(phoneCodeHash, code)
    if (ok) await client.connect()
    return ok
  }

  async verify2FA(tenantId: string, password: string): Promise<boolean> {
    const client = this.clients.get(tenantId)
    if (!client) throw new Error(`No pending auth for tenant: ${tenantId}`)
    const ok = await client.verify2FA(password)
    if (ok) await client.connect()
    return ok
  }

  async resume(tenantId: string, phone: string): Promise<TelegramUserClient> {
    if (this.clients.has(tenantId)) return this.clients.get(tenantId)!
    const config = this.makeConfig(tenantId, phone)
    const client = new TelegramUserClient(config)
    await client.connect()
    this.clients.set(tenantId, client)
    return client
  }

  get(tenantId: string): TelegramUserClient | undefined {
    return this.clients.get(tenantId)
  }

  async disconnect(tenantId: string): Promise<void> {
    const client = this.clients.get(tenantId)
    if (client) {
      await client.disconnect()
      this.clients.delete(tenantId)
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [, client] of this.clients) {
      await client.disconnect()
    }
    this.clients.clear()
  }
}

export const bridgeManager = new TelegramBridgeManager()
