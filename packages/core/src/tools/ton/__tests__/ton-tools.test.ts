import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock @ton/core to avoid real address validation
vi.mock("@ton/core", () => ({
  Address: {
    parse: (addr: string) => ({
      toString: () => addr,
    }),
  },
  toNano: (v: string | number) => BigInt(Math.round(Number(v) * 1e9)),
  fromNano: (v: bigint) => (Number(v) / 1e9).toString(),
  WalletContractV4: { create: vi.fn() },
  WalletContractV5R1: { create: vi.fn() },
  internal: vi.fn(() => ({})),
}))

vi.mock("../../../ton/wallet-service.js", () => ({
  getWalletBalance: vi.fn(),
  getWalletAddress: vi.fn(),
  loadWallet: vi.fn(),
  getTonPrice: vi.fn(),
}))

vi.mock("../../../ton/transfer.js", () => ({
  sendTon: vi.fn(),
}))

vi.mock("../../../utils/logger.js", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}))

import { getWalletBalance, getWalletAddress, loadWallet, getTonPrice } from "../../../ton/wallet-service.js"
import { sendTon } from "../../../ton/transfer.js"

const mockGetWalletBalance = vi.mocked(getWalletBalance)
const mockGetWalletAddress = vi.mocked(getWalletAddress)
const mockLoadWallet = vi.mocked(loadWallet)
const mockSendTon = vi.mocked(sendTon)
const mockGetTonPrice = vi.mocked(getTonPrice)

const VALID_TON_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"

// ─── ton_balance ──────────────────────────────────────────────────────────────

describe("ton_balance", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns balance when wallet is initialised", async () => {
    mockGetWalletBalance.mockResolvedValueOnce(BigInt(2_500_000_000))
    const { tonGetBalanceExecutor } = await import("../get-balance.js")

    const result = await tonGetBalanceExecutor({}, { walletAddress: VALID_TON_ADDRESS } as never)
    expect(result.success).toBe(true)
    expect((result.data as { balance: string }).balance).toBe("2.5000")
    expect((result.data as { address: string }).address).toBe(VALID_TON_ADDRESS)
  })

  it("returns error when wallet not initialised", async () => {
    const { tonGetBalanceExecutor } = await import("../get-balance.js")
    const result = await tonGetBalanceExecutor({}, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Wallet not initialized")
  })

  it("returns 0.0000 for zero balance", async () => {
    mockGetWalletBalance.mockResolvedValueOnce(BigInt(0))
    const { tonGetBalanceExecutor } = await import("../get-balance.js")

    const result = await tonGetBalanceExecutor({}, { walletAddress: VALID_TON_ADDRESS } as never)
    expect(result.success).toBe(true)
    expect((result.data as { balance: string }).balance).toBe("0.0000")
  })

  it("returns error when wallet service throws", async () => {
    mockGetWalletBalance.mockRejectedValueOnce(new Error("RPC unavailable"))
    const { tonGetBalanceExecutor } = await import("../get-balance.js")

    const result = await tonGetBalanceExecutor({}, { walletAddress: VALID_TON_ADDRESS } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("RPC unavailable")
  })
})

// ─── ton_get_address ──────────────────────────────────────────────────────────

describe("ton_get_address", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns parsed wallet address", async () => {
    const { tonGetAddressExecutor } = await import("../get-address.js")
    const result = await tonGetAddressExecutor({}, { walletAddress: VALID_TON_ADDRESS } as never)
    expect(result.success).toBe(true)
    expect((result.data as { address: string }).address).toBeDefined()
  })

  it("returns error when no wallet address in context", async () => {
    const { tonGetAddressExecutor } = await import("../get-address.js")
    const result = await tonGetAddressExecutor({}, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Wallet not initialized")
  })
})

// ─── ton_send ─────────────────────────────────────────────────────────────────
// NOTE: ton_send uses context.mnemonic (string[]) not walletAddress

describe("ton_send", () => {
  beforeEach(() => vi.clearAllMocks())

  const MOCK_MNEMONIC = ["word1", "word2", "word3"]

  it("sends TON successfully", async () => {
    mockLoadWallet.mockResolvedValueOnce({
      wallet: { address: { toString: () => VALID_TON_ADDRESS } },
      keyPair: {},
    } as never)
    mockSendTon.mockResolvedValueOnce({ hash: "abc123" } as never)
    const { tonSendExecutor } = await import("../send.js")

    const result = await tonSendExecutor(
      { to: VALID_TON_ADDRESS, amount: 1.5, comment: "test payment" },
      { mnemonic: MOCK_MNEMONIC, walletAddress: VALID_TON_ADDRESS } as never
    )
    expect(result.success).toBe(true)
    expect((result.data as { amount: number }).amount).toBe(1.5)
  })

  it("returns error when mnemonic is missing", async () => {
    const { tonSendExecutor } = await import("../send.js")
    const result = await tonSendExecutor(
      { to: VALID_TON_ADDRESS, amount: 1 },
      {} as never
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("No wallet mnemonic")
  })

  it("returns error on transfer failure", async () => {
    mockLoadWallet.mockResolvedValueOnce({
      wallet: { address: { toString: () => VALID_TON_ADDRESS } },
    } as never)
    mockSendTon.mockRejectedValueOnce(new Error("insufficient balance"))
    const { tonSendExecutor } = await import("../send.js")

    const result = await tonSendExecutor(
      { to: VALID_TON_ADDRESS, amount: 9999 },
      { mnemonic: MOCK_MNEMONIC } as never
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("insufficient balance")
  })
})

// ─── ton_get_price ────────────────────────────────────────────────────────────
// NOTE: tonPriceExecutor uses getTonPrice() from wallet-service, not fetch directly

describe("ton_get_price", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns current TON price in USD", async () => {
    mockGetTonPrice.mockResolvedValueOnce(3.14)
    const { tonPriceExecutor } = await import("../get-price.js")

    const result = await tonPriceExecutor({}, {} as never)
    expect(result.success).toBe(true)
    expect((result.data as { price: number }).price).toBe(3.14)
    expect((result.data as { currency: string }).currency).toBe("USD")
  })

  it("returns error when price fetch fails", async () => {
    mockGetTonPrice.mockRejectedValueOnce(new Error("CoinGecko unavailable"))
    const { tonPriceExecutor } = await import("../get-price.js")

    const result = await tonPriceExecutor({}, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("CoinGecko unavailable")
  })

  it("returns error when price is zero", async () => {
    mockGetTonPrice.mockResolvedValueOnce(0)
    const { tonPriceExecutor } = await import("../get-price.js")

    const result = await tonPriceExecutor({}, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Failed to fetch TON price")
  })
})
