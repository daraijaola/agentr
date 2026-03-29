import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../../../constants/api-endpoints.js", () => ({
  tonapiFetch: vi.fn(),
}))

import { tonapiFetch } from "../../../constants/api-endpoints.js"
const mockTonapiFetch = vi.mocked(tonapiFetch)

import { dnsCheckExecutor } from "../check.js"

describe("dns_check", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns AVAILABLE when TonAPI returns 404", async () => {
    mockTonapiFetch.mockResolvedValueOnce({ status: 404, ok: false } as never)

    const result = await dnsCheckExecutor({ domain: "myproject" }, {} as never)
    expect(result.success).toBe(true)
    expect((result.data as { status: string }).status).toBe("AVAILABLE")
    expect((result.data as { domain: string }).domain).toBe("myproject.ton")
  })

  it("normalizes domain by stripping .ton suffix", async () => {
    mockTonapiFetch.mockResolvedValueOnce({ status: 404, ok: false } as never)

    const result = await dnsCheckExecutor({ domain: "myproject.ton" }, {} as never)
    expect(result.success).toBe(true)
    expect((result.data as { domain: string }).domain).toBe("myproject.ton")
  })

  it("normalizes domain to lowercase", async () => {
    mockTonapiFetch.mockResolvedValueOnce({ status: 404, ok: false } as never)

    const result = await dnsCheckExecutor({ domain: "MYPROJECT" }, {} as never)
    expect((result.data as { domain: string }).domain).toBe("myproject.ton")
  })

  it("returns OWNED when domain has owner", async () => {
    mockTonapiFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        item: {
          owner: { address: "EQD...owner" },
          address: "EQD...nft",
        },
        expiring_at: 1_800_000_000,
      }),
    } as never)

    const result = await dnsCheckExecutor({ domain: "owned-domain" }, {} as never)
    expect(result.success).toBe(true)
    expect((result.data as { status: string }).status).toBe("OWNED")
    expect((result.data as { owner: string }).owner).toBe("EQD...owner")
  })

  it("returns IN_AUCTION when domain is in auction", async () => {
    mockTonapiFetch
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ item: { address: "EQD...nft" } }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            domain: "auction-domain.ton",
            price: "5000000000",
            bids: 3,
            date: 1_800_000_000,
          }],
        }),
      } as never)

    const result = await dnsCheckExecutor({ domain: "auction-domain" }, {} as never)
    expect(result.success).toBe(true)
    expect((result.data as { status: string }).status).toBe("IN_AUCTION")
    expect((result.data as { currentBid: string }).currentBid).toBe("5 TON")
  })

  it("rejects domain shorter than 4 characters", async () => {
    const result = await dnsCheckExecutor({ domain: "abc" }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("4-126 characters")
  })

  it("rejects domain with invalid characters", async () => {
    const result = await dnsCheckExecutor({ domain: "my_domain!" }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("lowercase letters")
  })

  it("includes minPrice estimate for available domain", async () => {
    mockTonapiFetch.mockResolvedValueOnce({ status: 404, ok: false } as never)

    const result = await dnsCheckExecutor({ domain: "test" }, {} as never)
    expect((result.data as { minPrice: string }).minPrice).toBe("~100 TON")
  })

  it("returns error on TonAPI non-404 failure", async () => {
    mockTonapiFetch.mockResolvedValueOnce({ status: 500, ok: false } as never)

    const result = await dnsCheckExecutor({ domain: "broken-domain" }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("TonAPI error")
  })

  it("returns error when fetch throws", async () => {
    mockTonapiFetch.mockRejectedValueOnce(new Error("Network timeout"))

    const result = await dnsCheckExecutor({ domain: "error-domain" }, {} as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Network timeout")
  })
})
