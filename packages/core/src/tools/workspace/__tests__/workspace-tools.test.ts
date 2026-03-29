import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

let tmpRoot: string
let tenantId: string

// Use a real temp directory so we test actual file I/O
beforeEach(() => {
  tenantId = `test-tenant-${Date.now()}`
  tmpRoot = join(tmpdir(), `agentr-ws-test-${Date.now()}`)
  mkdirSync(join(tmpRoot, tenantId), { recursive: true })
  process.env["SESSIONS_PATH"] = tmpRoot
})

afterEach(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
  delete process.env["SESSIONS_PATH"]
  vi.restoreAllMocks()
})

// ─── write ───────────────────────────────────────────────────────────────────

describe("workspace_write", () => {
  it("writes a new text file", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const result = await workspaceWriteExecutor({ path: "hello.txt", content: "world" }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { message: string }).message).toContain("written")
  })

  it("overwrites existing file by default", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    await workspaceWriteExecutor({ path: "overwrite.txt", content: "first" }, { tenantId } as never)
    const result = await workspaceWriteExecutor({ path: "overwrite.txt", content: "second" }, { tenantId } as never)
    expect(result.success).toBe(true)
  })

  it("appends to file when append=true", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    await workspaceWriteExecutor({ path: "log.txt", content: "line1\n" }, { tenantId } as never)
    const result = await workspaceWriteExecutor({ path: "log.txt", content: "line2\n", append: true }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { append: boolean }).append).toBe(true)
  })

  it("creates nested directories with createDirs=true", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const result = await workspaceWriteExecutor({ path: "deep/nested/file.js", content: "const x = 1" }, { tenantId } as never)
    expect(result.success).toBe(true)
  })

  it("rejects path traversal attempt", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const result = await workspaceWriteExecutor({ path: "../../etc/passwd", content: "hack" }, { tenantId } as never)
    expect(result.success).toBe(false)
  })

  it("decodes base64 encoded content", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const base64 = Buffer.from("hello base64").toString("base64")
    const result = await workspaceWriteExecutor({ path: "data.bin", content: base64, encoding: "base64" }, { tenantId } as never)
    expect(result.success).toBe(true)
  })

  it("rejects content exceeding 50 MB size limit", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const hugContent = "x".repeat(51 * 1024 * 1024)
    const result = await workspaceWriteExecutor({ path: "huge.txt", content: hugContent }, { tenantId } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("exceeds maximum write size")
  })
})

// ─── read ────────────────────────────────────────────────────────────────────
// NOTE: files are written via workspaceWriteExecutor so that both write and
// read use the same SESSIONS_ROOT (evaluated at module-load time).

describe("workspace_read", () => {
  it("reads an existing text file", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const { workspaceReadExecutor } = await import("../read.js")
    await workspaceWriteExecutor({ path: "readme.md", content: "# Hello World" }, { tenantId } as never)

    const result = await workspaceReadExecutor({ path: "readme.md" }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { content: string }).content).toBe("# Hello World")
  })

  it("returns error for non-existent file", async () => {
    const { workspaceReadExecutor } = await import("../read.js")
    const result = await workspaceReadExecutor({ path: "missing-file-xyz.md" }, { tenantId } as never)
    expect(result.success).toBe(false)
  })

  it("returns binary metadata for non-text extension without base64", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const { workspaceReadExecutor } = await import("../read.js")
    const base64Png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64")
    await workspaceWriteExecutor({ path: "image.png", content: base64Png, encoding: "base64" }, { tenantId } as never)

    const result = await workspaceReadExecutor({ path: "image.png" }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { type: string }).type).toBe("binary")
  })

  it("reads binary file as base64", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const { workspaceReadExecutor } = await import("../read.js")
    const base64 = Buffer.from("hello binary").toString("base64")
    await workspaceWriteExecutor({ path: "data.bin", content: base64, encoding: "base64" }, { tenantId } as never)

    const result = await workspaceReadExecutor({ path: "data.bin", encoding: "base64" }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { encoding: string }).encoding).toBe("base64")
  })

  it("rejects path traversal attempt", async () => {
    const { workspaceReadExecutor } = await import("../read.js")
    const result = await workspaceReadExecutor({ path: "../../etc/passwd" }, { tenantId } as never)
    expect(result.success).toBe(false)
  })

  it("respects maxSize limit", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const { workspaceReadExecutor } = await import("../read.js")
    await workspaceWriteExecutor({ path: "big.txt", content: "x".repeat(2000) }, { tenantId } as never)

    const result = await workspaceReadExecutor({ path: "big.txt", maxSize: 100 }, { tenantId } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("exceeds limit")
  })
})

// ─── list ────────────────────────────────────────────────────────────────────
// NOTE: files written via workspaceWriteExecutor to match the cached SESSIONS_ROOT

describe("workspace_list", () => {
  it("lists files in workspace root", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const { workspaceListExecutor } = await import("../list.js")
    await workspaceWriteExecutor({ path: "a.txt", content: "" }, { tenantId } as never)
    await workspaceWriteExecutor({ path: "b.json", content: "{}" }, { tenantId } as never)

    const result = await workspaceListExecutor({ path: "." }, { tenantId } as never)
    expect(result.success).toBe(true)
  })

  it("returns success for an empty-ish workspace", async () => {
    const { workspaceListExecutor } = await import("../list.js")
    const result = await workspaceListExecutor({ path: "." }, { tenantId } as never)
    expect(result.success).toBe(true)
  })

  it("rejects path traversal attempt", async () => {
    const { workspaceListExecutor } = await import("../list.js")
    const result = await workspaceListExecutor({ path: "../../etc" }, { tenantId } as never)
    expect(result.success).toBe(false)
  })
})

// ─── delete ──────────────────────────────────────────────────────────────────

describe("workspace_delete", () => {
  it("deletes an existing file", async () => {
    const { workspaceWriteExecutor } = await import("../write.js")
    const { workspaceDeleteExecutor } = await import("../delete.js")
    await workspaceWriteExecutor({ path: "to-delete.txt", content: "bye" }, { tenantId } as never)

    const result = await workspaceDeleteExecutor({ path: "to-delete.txt" }, { tenantId } as never)
    expect(result.success).toBe(true)
  })

  it("returns error when file does not exist", async () => {
    const { workspaceDeleteExecutor } = await import("../delete.js")
    const result = await workspaceDeleteExecutor({ path: "no-such-file-xyz.txt" }, { tenantId } as never)
    expect(result.success).toBe(false)
  })

  it("rejects path traversal attempt", async () => {
    const { workspaceDeleteExecutor } = await import("../delete.js")
    const result = await workspaceDeleteExecutor({ path: "../../important" }, { tenantId } as never)
    expect(result.success).toBe(false)
  })
})
