import { TelegramUserClient } from './client.js'

export class TelegramBridge {
  private client: TelegramUserClient

  constructor(client: TelegramUserClient) {
    this.client = client
  }

  async requestOtp() { return this.client.requestOtp() }
  async verifyOtp(phoneCodeHash: string, code: string) { return this.client.verifyOtp(phoneCodeHash, code) }
  async verify2FA(password: string) { return this.client.verify2FA(password) }
  async sendMessage(chatId: string, text: string, opts?: { replyTo?: number }) { return this.client.sendMessage(chatId, text, opts) }
  async disconnect() { return this.client.disconnect() }
  getClient() { return this.client }
}
