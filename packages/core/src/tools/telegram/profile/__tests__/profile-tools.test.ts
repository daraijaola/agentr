import { describe, it, expect, vi } from "vitest"

vi.mock("../../../../utils/logger.js", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}))

function makeGramJs(overrides: Record<string, unknown> = {}) {
  return {
    invoke: vi.fn().mockResolvedValue({}),
    getInputEntity: vi.fn().mockResolvedValue({ _: "inputPeerUser", userId: BigInt(123) }),
    ...overrides,
  }
}

function makeBridge(gramJsOverrides?: Record<string, unknown>) {
  const gramJs = makeGramJs(gramJsOverrides)
  return {
    isAvailable: () => true,
    getClient: () => ({ getClient: () => gramJs }),
    _gramJs: gramJs,
  }
}

// ─── set_bio ──────────────────────────────────────────────────────────────────

describe("telegram_set_bio", () => {
  it("sets profile bio successfully", async () => {
    const { telegramSetBioExecutor } = await import("../set-bio.js")
    const bridge = makeBridge()

    const result = await telegramSetBioExecutor({ bio: "AI agent on TON" }, { bridge } as never)
    expect(result.success).toBe(true)
    expect((result.data as { bio: string }).bio).toBe("AI agent on TON")
  })

  it("returns error when invoke throws", async () => {
    const { telegramSetBioExecutor } = await import("../set-bio.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockRejectedValueOnce(new Error("ABOUT_TOO_LONG"))

    const result = await telegramSetBioExecutor({ bio: "x".repeat(200) }, { bridge } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("ABOUT_TOO_LONG")
  })

  it("stores bio in result data with correct length", async () => {
    const { telegramSetBioExecutor } = await import("../set-bio.js")
    const bridge = makeBridge()

    const result = await telegramSetBioExecutor({ bio: "Hello TON" }, { bridge } as never)
    expect(result.success).toBe(true)
    expect((result.data as { length: number }).length).toBe(9)
  })
})

// ─── set_username ─────────────────────────────────────────────────────────────

describe("telegram_set_username", () => {
  it("sets username successfully", async () => {
    const { telegramSetUsernameExecutor } = await import("../set-username.js")
    const bridge = makeBridge()

    const result = await telegramSetUsernameExecutor({ username: "my_agent_v2" }, { bridge } as never)
    expect(result.success).toBe(true)
  })

  it("returns error when username is taken", async () => {
    const { telegramSetUsernameExecutor } = await import("../set-username.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockRejectedValueOnce(new Error("USERNAME_OCCUPIED"))

    const result = await telegramSetUsernameExecutor({ username: "taken_name" }, { bridge } as never)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("rejects username with invalid characters before API call", async () => {
    const { telegramSetUsernameExecutor } = await import("../set-username.js")
    const bridge = makeBridge()

    const result = await telegramSetUsernameExecutor({ username: "!!bad!!" }, { bridge } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("letters, numbers, and underscores")
  })
})

// ─── update_profile ───────────────────────────────────────────────────────────

describe("telegram_update_profile", () => {
  it("updates first name successfully", async () => {
    const { telegramUpdateProfileExecutor } = await import("../update-profile.js")
    const bridge = makeBridge()

    const result = await telegramUpdateProfileExecutor(
      { firstName: "AGENTR" },
      { bridge } as never
    )
    expect(result.success).toBe(true)
  })

  it("updates first and last name together", async () => {
    const { telegramUpdateProfileExecutor } = await import("../update-profile.js")
    const bridge = makeBridge()

    const result = await telegramUpdateProfileExecutor(
      { firstName: "AGENTR", lastName: "Bot" },
      { bridge } as never
    )
    expect(result.success).toBe(true)
  })

  it("returns error when no fields are provided", async () => {
    const { telegramUpdateProfileExecutor } = await import("../update-profile.js")
    const bridge = makeBridge()

    const result = await telegramUpdateProfileExecutor({ firstName: "" }, { bridge } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("At least one field must be provided")
  })

  it("returns error on API failure", async () => {
    const { telegramUpdateProfileExecutor } = await import("../update-profile.js")
    const bridge = makeBridge()
    bridge._gramJs.invoke.mockRejectedValueOnce(new Error("FIRSTNAME_INVALID"))

    const result = await telegramUpdateProfileExecutor({ firstName: "x" }, { bridge } as never)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
