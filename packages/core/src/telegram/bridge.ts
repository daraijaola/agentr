import { TelegramUserClient } from './client.js'

export class TelegramBridge {
  private client: TelegramUserClient

  constructor(private sessionPath: string) {
    this.client = new TelegramUserClient(sessionPath)
  }

  async requestOtp(phone: string) {
    return this.client.requestOtp(phone)
  }

  async verifyOtp(phoneCodeHash: string, code: string) {
    return this.client.verifyOtp(phoneCodeHash, code)
  }

  async verify2FA(password: string) {
    return this.client.verify2FA(password)
  }

  async sendMessage(chatId: string, text: string, opts?: { replyTo?: number }) {
    return this.client.sendMessage(chatId, text, opts)
  }

  async disconnect() {
    return this.client.disconnect()
  }

  getClient() {
    return this.client
  }
}
