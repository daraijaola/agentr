import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { telegramBotApiExecutor } from "../bot-api.js"

const VALID_TOKEN = "123456789:ABCdefGhiJKLmnopQRsTUVwxyz"

describe("telegram_bot_api", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls getMe successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: true, result: { id: 123, first_name: "TestBot", username: "test_bot" } }),
    })

    const result = await telegramBotApiExecutor({ token: VALID_TOKEN, method: "getMe" }, {} as never)
    expect(result.success).toBe(true)
    expect((result.data as { result: { username: string } }).result.username).toBe("test_bot")
    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${VALID_TOKEN}/getMe`,
      expect.objectContaining({ method: "GET" })
    )
  })

  it("calls setChatMenuButton with POST and payload", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: true, result: true }),
    })

    const payload = {
      menu_button: { type: "web_app", text: "Open App", web_app: { url: "https://agentr.online/sites/t1/index.html" } },
    }

    const result = await telegramBotApiExecutor({ token: VALID_TOKEN, method: "setChatMenuButton", payload }, {} as never)
    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${VALID_TOKEN}/setChatMenuButton`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    )
  })

  it("returns error when Telegram API returns ok:false", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: false, description: "Bad Request: chat not found" }),
    })

    const result = await telegramBotApiExecutor({ token: VALID_TOKEN, method: "sendMessage", payload: { chat_id: 0, text: "hi" } }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Bad Request: chat not found")
  })

  it("returns error for invalid token format (no colon)", async () => {
    const result = await telegramBotApiExecutor({ token: "notavalidtoken", method: "getMe" }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid bot token format")
  })

  it("returns error for empty token", async () => {
    const result = await telegramBotApiExecutor({ token: "", method: "getMe" }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid bot token format")
  })

  it("returns error for missing method", async () => {
    const result = await telegramBotApiExecutor({ token: VALID_TOKEN, method: "" }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("method is required")
  })

  it("returns error when fetch throws (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"))

    const result = await telegramBotApiExecutor({ token: VALID_TOKEN, method: "getMe" }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Network failure")
  })

  it("sets bot commands via setMyCommands", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: true, result: true }),
    })

    const result = await telegramBotApiExecutor({
      token: VALID_TOKEN,
      method: "setMyCommands",
      payload: { commands: [{ command: "start", description: "Start the bot" }] },
    }, {} as never)

    expect(result.success).toBe(true)
    expect((result.data as { method: string }).method).toBe("setMyCommands")
  })

  it("uses GET when no payload is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: true, result: [] }),
    })

    await telegramBotApiExecutor({ token: VALID_TOKEN, method: "getMyCommands" }, {} as never)

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(options.method).toBe("GET")
    expect(options.body).toBeUndefined()
  })
})
