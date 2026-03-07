// Telegram MTProto bridge  GramJS (TONresistor fork)
// TODO: Adapt from Teleton src/telegram/
// Multi-user: one session file per tenantId

export class TelegramBridge {
  private tenantId: string
  private sessionPath: string

  constructor(tenantId: string, sessionPath: string) {
    this.tenantId = tenantId
    this.sessionPath = sessionPath
  }

  async connect(_phone: string): Promise<string> {
    // TODO: init GramJS client, request phone code
    // Returns: phoneCodeHash
    return 'phone_code_hash_placeholder'
  }

  async verifyOtp(_phone: string, _hash: string, _code: string): Promise<boolean> {
    // TODO: complete MTProto auth, save session to sessionPath
    return false
  }

  async sendMessage(_chatId: string, _text: string): Promise<void> {
    // TODO: GramJS sendMessage
  }

  async disconnect(): Promise<void> {
    // TODO: cleanup GramJS client
  }
}
