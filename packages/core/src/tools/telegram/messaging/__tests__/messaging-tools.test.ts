import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../../../utils/logger.js", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}))

vi.mock("../../../../telegram/formatting.js", () => ({
  markdownToTelegramHtml: (text: string) => text,
}))

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeBridge(overrides: Record<string, unknown> = {}) {
  const mockGramJs = {
    invoke: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn(),
    editMessage: vi.fn().mockResolvedValue({ date: 1700000000 }),
    deleteMessages: vi.fn(),
    getMessages: vi.fn(),
    getEntity: vi.fn().mockResolvedValue({ _: "inputChannel" }),
    pinMessage: vi.fn(),
    forwardMessages: vi.fn(),
    getInputEntity: vi.fn().mockResolvedValue({ _: "inputPeerUser" }),
    ...overrides,
  }
  return {
    isAvailable: () => true,
    sendMessage: vi.fn(async (_opts: { chatId: string; text: string }) => ({ id: 99, date: 1700000000 })),
    getClient: () => ({ getClient: () => mockGramJs }),
    _gramJs: mockGramJs,
  }
}

// ─── send_message ─────────────────────────────────────────────────────────────

describe("telegram_send_message", () => {
  it("sends a message and returns messageId", async () => {
    const { telegramSendMessageExecutor } = await import("../send-message.js")
    const bridge = makeBridge()
    const result = await telegramSendMessageExecutor(
      { chatId: "123456", text: "Hello!" },
      { bridge } as never
    )
    expect(result.success).toBe(true)
    expect((result.data as { messageId: number }).messageId).toBe(99)
  })

  it("sends a reply when replyToId is provided", async () => {
    const { telegramSendMessageExecutor } = await import("../send-message.js")
    const bridge = makeBridge()
    const result = await telegramSendMessageExecutor(
      { chatId: "123456", text: "Replying!", replyToId: 42 },
      { bridge } as never
    )
    expect(result.success).toBe(true)
    expect(bridge.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ replyToId: 42 }))
  })

  it("returns error when bridge.sendMessage throws", async () => {
    const { telegramSendMessageExecutor } = await import("../send-message.js")
    const bridge = makeBridge()
    bridge.sendMessage = vi.fn().mockRejectedValueOnce(new Error("FLOOD_WAIT_30"))

    const result = await telegramSendMessageExecutor(
      { chatId: "123456", text: "Test" },
      { bridge } as never
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("FLOOD_WAIT_30")
  })
})

// ─── edit_message ─────────────────────────────────────────────────────────────

describe("telegram_edit_message", () => {
  beforeEach(() => vi.clearAllMocks())

  it("edits message and returns edited=true", async () => {
    const { telegramEditMessageExecutor } = await import("../edit-message.js")
    const bridge = makeBridge()
    bridge._gramJs.editMessage.mockResolvedValueOnce({ date: 1700000000 })

    const result = await telegramEditMessageExecutor(
      { chatId: "123456", messageId: 77, text: "Updated text" },
      { bridge } as never
    )
    expect(result.success).toBe(true)
    expect((result.data as { edited: boolean }).edited).toBe(true)
    expect((result.data as { messageId: number }).messageId).toBe(77)
  })

  it("returns error when GramJS throws", async () => {
    const { telegramEditMessageExecutor } = await import("../edit-message.js")
    const bridge = makeBridge()
    bridge._gramJs.editMessage.mockRejectedValueOnce(new Error("MESSAGE_NOT_MODIFIED"))

    const result = await telegramEditMessageExecutor(
      { chatId: "123456", messageId: 77, text: "same text" },
      { bridge } as never
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("MESSAGE_NOT_MODIFIED")
  })
})

// ─── delete_message ───────────────────────────────────────────────────────────
// NOTE: delete-message uses gramJs.invoke with Api.messages.DeleteMessages
// params: { chatId, messageIds: number[], revoke? }

describe("telegram_delete_message", () => {
  it("deletes messages in a regular chat", async () => {
    const { telegramDeleteMessageExecutor } = await import("../delete-message.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockResolvedValueOnce({ ptsCount: 1 })

    const result = await telegramDeleteMessageExecutor(
      { chatId: "123456", messageIds: [55, 56] },
      { bridge } as never
    )
    expect(result.success).toBe(true)
  })

  it("returns error when no message IDs provided", async () => {
    const { telegramDeleteMessageExecutor } = await import("../delete-message.js")
    const bridge = makeBridge()

    const result = await telegramDeleteMessageExecutor(
      { chatId: "123456", messageIds: [] },
      { bridge } as never
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("No message IDs")
  })

  it("returns error when invoke throws", async () => {
    const { telegramDeleteMessageExecutor } = await import("../delete-message.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockRejectedValueOnce(new Error("MESSAGE_ID_INVALID"))

    const result = await telegramDeleteMessageExecutor(
      { chatId: "123456", messageIds: [999] },
      { bridge } as never
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("MESSAGE_ID_INVALID")
  })
})

// ─── forward_message ──────────────────────────────────────────────────────────
// NOTE: params are { fromChatId, toChatId, messageIds: number[] }

describe("telegram_forward_message", () => {
  it("forwards messages successfully", async () => {
    const { telegramForwardMessageExecutor } = await import("../forward-message.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockResolvedValueOnce({
      updates: [{ id: 100, date: 1700000000 }],
    })

    const result = await telegramForwardMessageExecutor(
      { fromChatId: "111", toChatId: "222", messageIds: [33, 34] },
      { bridge } as never
    )
    expect(result.success).toBe(true)
  })

  it("returns error on forward failure", async () => {
    const { telegramForwardMessageExecutor } = await import("../forward-message.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockRejectedValueOnce(new Error("CHAT_WRITE_FORBIDDEN"))

    const result = await telegramForwardMessageExecutor(
      { fromChatId: "111", toChatId: "222", messageIds: [33] },
      { bridge } as never
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("CHAT_WRITE_FORBIDDEN")
  })
})

// ─── search_messages ──────────────────────────────────────────────────────────
// NOTE: uses gramJs.invoke with Api.messages.Search

describe("telegram_search_messages", () => {
  it("returns list of messages matching query", async () => {
    const { telegramSearchMessagesExecutor } = await import("../search-messages.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockResolvedValueOnce({
      messages: [
        { id: 1, message: "hello world", date: 1700000000, fromId: { userId: BigInt(99) } },
      ],
    })

    const result = await telegramSearchMessagesExecutor(
      { chatId: "123456", query: "hello", limit: 10 },
      { bridge } as never
    )
    expect(result.success).toBe(true)
  })

  it("returns error on search failure", async () => {
    const { telegramSearchMessagesExecutor } = await import("../search-messages.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockRejectedValueOnce(new Error("CHANNEL_PRIVATE"))

    const result = await telegramSearchMessagesExecutor(
      { chatId: "-100123456789", query: "test" },
      { bridge } as never
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("CHANNEL_PRIVATE")
  })
})
