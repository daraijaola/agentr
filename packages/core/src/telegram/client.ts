import { TelegramClient, Api } from 'telegram'
import { Logger, LogLevel } from 'telegram/extensions/Logger.js'
import { StringSession } from 'telegram/sessions/index.js'
import { NewMessage } from 'telegram/events/index.js'
import type { NewMessageEvent } from 'telegram/events/NewMessage.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { withFloodRetry } from './flood-retry.js'

//  Per-tenant Telegram MTProto client
// Per-tenant MTProto client — multi-tenant layer by AGENTR
// Key difference: one TelegramUserClient instance per tenantId, not global

export interface TelegramClientConfig {
  tenantId: string
  apiId: number
  apiHash: string
  phone: string
  sessionPath: string
  connectionRetries?: number
  retryDelay?: number
  autoReconnect?: boolean
  floodSleepThreshold?: number
}

export interface TelegramUser {
  id: bigint
  username?: string
  firstName?: string
  lastName?: string
  phone?: string
  isBot: boolean
}

export interface OtpRequest {
  phoneCodeHash: string
  phone: string
}

export class TelegramUserClient {
  private client: TelegramClient
  private config: TelegramClientConfig
  private connected = false
  private me?: TelegramUser

  constructor(config: TelegramClientConfig) {
    this.config = config
    const sessionString = this.loadSession()
    const session = new StringSession(sessionString)
    const logger = new Logger(LogLevel.NONE)

    this.client = new TelegramClient(session, config.apiId, config.apiHash, {
      connectionRetries: config.connectionRetries ?? 5,
      retryDelay: config.retryDelay ?? 1000,
      autoReconnect: config.autoReconnect ?? true,
      floodSleepThreshold: config.floodSleepThreshold ?? 60,
      baseLogger: logger,
    })
  }

  private loadSession(): string {
    try {
      if (existsSync(this.config.sessionPath)) {
        return readFileSync(this.config.sessionPath, 'utf-8').trim()
      }
    } catch {
      // no session yet  fresh auth needed
    }
    return ''
  }

  private saveSession(): void {
    try {
    // gramjs type quirk: connect() returns void
      const sessionString = this.client.session.save() as string | undefined
      if (typeof sessionString !== 'string' || !sessionString) return
      const dir = dirname(this.config.sessionPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(this.config.sessionPath, sessionString, { encoding: 'utf-8', mode: 0o600 })
      console.log(`[TelegramBridge:${this.config.tenantId}] Session saved`)
    } catch (err) {
      console.error(`[TelegramBridge:${this.config.tenantId}] Failed to save session`, err)
    }
  }

  // Step 1  called during onboarding: sends OTP to user's phone
  async requestOtp(): Promise<OtpRequest> {
    await this.client.connect()

    const result = await this.client.invoke(
      new Api.auth.SendCode({
        phoneNumber: this.config.phone,
        apiId: this.config.apiId,
        apiHash: this.config.apiHash,
        settings: new Api.CodeSettings({}),
      })
    )

    if (result instanceof Api.auth.SentCodeSuccess) {
      // Already authorized (session migration)
      this.saveSession()
      return { phoneCodeHash: '', phone: this.config.phone }
    }

    if (result instanceof Api.auth.SentCode) {
      return { phoneCodeHash: result.phoneCodeHash, phone: this.config.phone }
    }

    throw new Error('Unexpected auth response from Telegram')
  }

  // Step 2  called after user submits OTP code
  async verifyOtp(phoneCodeHash: string, code: string): Promise<boolean> {
    try {
      await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.config.phone,
          phoneCodeHash,
          phoneCode: code,
        })
      )
      this.saveSession()
      return true
    } catch (err: unknown) {
      const e = err as Record<string, string>

      // 2FA required
      if (e['errorMessage'] === 'SESSION_PASSWORD_NEEDED') {
        throw new Error('2FA_REQUIRED')
      }

      if (e['errorMessage'] === 'PHONE_CODE_INVALID') {
        return false
      }

      throw err
    }
  }

  // Step 3  optional: handle 2FA password
  async verify2FA(password: string): Promise<boolean> {
    try {
      const { computeCheck } = await import('telegram/Password.js')
      const srpResult = await this.client.invoke(new Api.account.GetPassword())
      const srpCheck = await computeCheck(srpResult, password)
      await this.client.invoke(new Api.auth.CheckPassword({ password: srpCheck }))
      this.saveSession()
      return true
    } catch {
      return false
    }
  }

  // Connect with existing session (agent restart)
  async connect(): Promise<void> {
    if (this.connected) return

    await this.client.connect()

    const me = (await this.client.getMe()) as Api.User
    this.me = {
      id: BigInt(me.id.toString()),
      username: me.username,
      firstName: me.firstName,
      lastName: me.lastName,
      phone: me.phone,
      isBot: me.bot ?? false,
    }

    this.connected = true
    console.log(`[TelegramBridge:${this.config.tenantId}] Connected as @${this.me.username}`)
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return
    await this.client.disconnect()
    this.connected = false
  }

  //  Message handlers
  onMessage(
    handler: (event: NewMessageEvent) => void | Promise<void>,
    filters?: { incoming?: boolean; outgoing?: boolean; pattern?: RegExp }
  ): void {
    this.client.addEventHandler(
      async (event: NewMessageEvent) => { await handler(event) },
      new NewMessage(filters ?? {})
    )
  }

  //  Actions
  async sendMessage(
    entity: string,
    text: string,
    options?: { replyTo?: number; silent?: boolean }
  ): Promise<Api.Message> {
    return withFloodRetry(() =>
      this.client.sendMessage(entity as never, {
        message: text,
        replyTo: options?.replyTo,
        silent: options?.silent,
        parseMode: 'html',
        linkPreview: false,
      })
    )
  }

  async getMessages(entity: string, limit = 50): Promise<Api.Message[]> {
    return this.client.getMessages(entity, { limit })
  }

  async getDialogs() {
    const dialogs = await this.client.getDialogs({})
    return dialogs.map((d) => ({
      id: BigInt(d.id?.toString() ?? '0'),
      title: d.title ?? 'Unknown',
      isGroup: d.isGroup,
      isChannel: d.isChannel,
    }))
  }

  async setTyping(entity: string): Promise<void> {
    try {
      await this.client.invoke(
        new Api.messages.SetTyping({
          peer: entity,
          action: new Api.SendMessageTypingAction(),
        })
      )
    } catch {
      // cosmetic  ignore errors
    }
  }

  async resolveUsername(username: string) {
    const clean = username.replace('@', '')
    const result = await this.client.invoke(
      new Api.contacts.ResolveUsername({ username: clean })
    )
    return result.users[0] || result.chats[0]
  }

  getMe(): TelegramUser | undefined { return this.me }
  isConnected(): boolean { return this.connected }
  getClient(): TelegramClient { return this.client }
}
