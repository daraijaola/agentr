import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// ─── serve_static ─────────────────────────────────────────────────────────────

describe("serve_static", () => {
  let tmpSessions: string
  let tmpSites: string
  let tenantId: string

  beforeEach(() => {
    tenantId = `tenant-${Date.now()}`
    tmpSessions = join(tmpdir(), `agentr-sessions-${Date.now()}`)
    tmpSites = join(tmpdir(), `agentr-sites-${Date.now()}`)
    mkdirSync(join(tmpSessions, tenantId), { recursive: true })
    mkdirSync(tmpSites, { recursive: true })
    process.env["SESSIONS_PATH"] = tmpSessions
    process.env["SITES_PATH"] = tmpSites
  })

  afterEach(() => {
    try { rmSync(tmpSessions, { recursive: true, force: true }) } catch {}
    try { rmSync(tmpSites, { recursive: true, force: true }) } catch {}
    delete process.env["SESSIONS_PATH"]
    delete process.env["SITES_PATH"]
    vi.restoreAllMocks()
  })

  it("publishes an existing file and returns a public URL", async () => {
    const { serveStaticExecutor } = await import("../serve-static.js")
    writeFileSync(join(tmpSessions, tenantId, "index.html"), "<h1>Hello</h1>")

    const result = await serveStaticExecutor({ path: "index.html" }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { url: string }).url).toContain("agentr.online/sites")
    expect((result.data as { url: string }).url).toContain("index.html")
  })

  it("returns error for missing file", async () => {
    const { serveStaticExecutor } = await import("../serve-static.js")
    const result = await serveStaticExecutor({ path: "nonexistent.html" }, { tenantId } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Path not found")
  })

  it("returns error for empty path", async () => {
    const { serveStaticExecutor } = await import("../serve-static.js")
    const result = await serveStaticExecutor({ path: "" }, { tenantId } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("path is required")
  })

  it("strips path traversal from provided path", async () => {
    const { serveStaticExecutor } = await import("../serve-static.js")
    writeFileSync(join(tmpSessions, tenantId, "safe.html"), "<p>safe</p>")
    const result = await serveStaticExecutor({ path: "../../etc/passwd" }, { tenantId } as never)
    expect(result.success).toBe(false)
  })

  it("publishes a directory and returns directory URL", async () => {
    const { serveStaticExecutor } = await import("../serve-static.js")
    const siteDir = join(tmpSessions, tenantId, "mysite")
    mkdirSync(siteDir, { recursive: true })
    writeFileSync(join(siteDir, "index.html"), "<h1>Site</h1>")

    const result = await serveStaticExecutor({ path: "mysite" }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { url: string }).url).toContain("mysite")
  })
})

// ─── delete_site ──────────────────────────────────────────────────────────────

describe("delete_site", () => {
  let tmpSessions: string
  let tmpSites: string
  let tenantId: string

  beforeEach(() => {
    tenantId = `tenant-${Date.now()}`
    tmpSessions = join(tmpdir(), `agentr-sessions-${Date.now()}`)
    tmpSites = join(tmpdir(), `agentr-sites-${Date.now()}`)
    mkdirSync(join(tmpSessions, tenantId), { recursive: true })
    mkdirSync(join(tmpSites, tenantId), { recursive: true })
    process.env["SESSIONS_PATH"] = tmpSessions
    process.env["SITES_PATH"] = tmpSites
  })

  afterEach(() => {
    try { rmSync(tmpSessions, { recursive: true, force: true }) } catch {}
    try { rmSync(tmpSites, { recursive: true, force: true }) } catch {}
    delete process.env["SESSIONS_PATH"]
    delete process.env["SITES_PATH"]
    vi.restoreAllMocks()
  })

  it("deletes a published file", async () => {
    writeFileSync(join(tmpSites, tenantId, "index.html"), "<h1>hi</h1>")
    const { deleteSiteExecutor } = await import("../delete-site.js")
    const result = await deleteSiteExecutor({ path: "index.html" }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { deleted: string }).deleted).toBe("index.html")
  })

  it("returns error when published file not found", async () => {
    const { deleteSiteExecutor } = await import("../delete-site.js")
    const result = await deleteSiteExecutor({ path: "missing.html" }, { tenantId } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("not found")
  })

  it("wipes all site files when path='.'", async () => {
    writeFileSync(join(tmpSites, tenantId, "index.html"), "<h1>hi</h1>")
    const { deleteSiteExecutor } = await import("../delete-site.js")
    const result = await deleteSiteExecutor({ path: "." }, { tenantId } as never)
    expect(result.success).toBe(true)
    expect((result.data as { message: string }).message).toContain("All published site files removed")
  })

  it("returns error for empty path", async () => {
    const { deleteSiteExecutor } = await import("../delete-site.js")
    const result = await deleteSiteExecutor({ path: "" }, { tenantId } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("path is required")
  })

  it("sanitizes path traversal attempts", async () => {
    const { deleteSiteExecutor } = await import("../delete-site.js")
    const result = await deleteSiteExecutor({ path: "../../etc/passwd" }, { tenantId } as never)
    expect(result.success).toBe(false)
  })
})

// ─── code_execute ─────────────────────────────────────────────────────────────

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>()
  return {
    ...actual,
    spawnSync: vi.fn(),
  }
})

import { spawnSync } from "child_process"
const mockSpawnSync = vi.mocked(spawnSync)

describe("code_execute", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns error when container not found (docker cp fails)", async () => {
    mockSpawnSync.mockReturnValueOnce({ status: 1, stdout: "", stderr: "Error: No such container", error: undefined } as never)

    const { codeExecuteExecutor } = await import("../code-execute.js")
    const result = await codeExecuteExecutor({ language: "javascript", code: "console.log('hi')" }, { tenantId: "t1" } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("not found or not running")
  })

  it("returns stdout on successful execution", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "", error: undefined } as never) // docker cp
      .mockReturnValueOnce({ status: 0, stdout: "hello world", stderr: "", error: undefined } as never) // docker exec run
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" } as never) // docker exec rm

    const { codeExecuteExecutor } = await import("../code-execute.js")
    const result = await codeExecuteExecutor({ language: "javascript", code: "console.log('hello world')" }, { tenantId: "t1" } as never)
    expect(result.success).toBe(true)
    expect((result.data as { stdout: string }).stdout).toContain("hello world")
  })

  it("returns error for code exceeding 100 KB", async () => {
    const { codeExecuteExecutor } = await import("../code-execute.js")
    const bigCode = "x".repeat(101 * 1024)
    const result = await codeExecuteExecutor({ language: "python", code: bigCode }, { tenantId: "t1" } as never)
    expect(result.success).toBe(false)
    expect(result.error).toContain("exceeds 100 KB")
  })

  it("passes timeout to docker exec command", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" } as never)
      .mockReturnValueOnce({ status: 0, stdout: "done", stderr: "" } as never)
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" } as never)

    const { codeExecuteExecutor } = await import("../code-execute.js")
    await codeExecuteExecutor({ language: "bash", code: "echo done", timeout: 60 }, { tenantId: "t1" } as never)

    const execCall = mockSpawnSync.mock.calls[1] as [string, string[]]
    expect(execCall[1]).toContain("60")
  })

  it("handles bash language", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" } as never)
      .mockReturnValueOnce({ status: 0, stdout: "bash output", stderr: "" } as never)
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" } as never)

    const { codeExecuteExecutor } = await import("../code-execute.js")
    const result = await codeExecuteExecutor({ language: "bash", code: "echo bash output" }, { tenantId: "t1" } as never)
    expect(result.success).toBe(true)
    expect((result.data as { language: string }).language).toBe("bash")
  })
})
