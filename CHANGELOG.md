# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-03-27

### Added

- **JWT authentication** — replaced custom HMAC scheme with `jose` HS256 JWT (24h TTL, algorithm pinned, expiry enforced). Auth routes now fully async
- **Docker sandbox per tenant** — `DockerProvisioner` fully implemented: `spawn`, `kill`, `status` with `--network=none`, `--cap-drop=ALL`, `--read-only`. Graceful fallback when Docker is unavailable. `Dockerfile.agent` added (Node 20 + Python 3 + PM2)
- **Docker-routed exec** — `exec_run` and `exec_install` detect a running tenant container and route commands through `docker exec` instead of running on the host
- **Conversation persistence** — conversation history saved to `conversation_state` PostgreSQL table (JSONB). Loaded automatically on agent resume. New migration `002_conversation_state.sql`
- **System prompt module** — 60-line inline prompt extracted to `packages/core/src/agent/prompts/system.ts` with named exported sections (`CRITICAL_OVERRIDES`, `ABSOLUTE_RULES`, `EXECUTION_FLOW`, etc.) and `buildSystemPrompt()`
- **Per-tenant rate limiting** — `POST /agent/message` limited to 30 requests/min per tenant using the existing `rate_limits` table with key `tenant:<id>`
- **Health endpoints** — `GET /health` (liveness + uptime) and `GET /health/ready` (DB ping + active agent count, returns 503 on DB failure)
- **AIR LLM provider** — internal OpenAI-compatible proxy supported as `LLM_PROVIDER=air` with `AIR_BASE_URL` env var
- **Per-tenant concurrency guard** — `activeLoops` counter prevents overlapping agentic loops per tenant. `isBusy` getter exposed
- **`AGENT_MAX_ITER` env var** — configurable max LLM loop iterations per message (1–20, default 12)
- **`AgentFactory.activeCount()`** — returns count of currently live runtimes (used by `/health/ready`)
- **Dev token rotation** — `POST /agent/dev/logout` rotates the static dev bearer token to a new `randomBytes(32)` hex value, immediately invalidating the old one
- **Authenticated trial cleanup** — `POST /agent/trial-expire/:tenantId` (auth required) triggers `deprovision` + `blockPhone` for expired trials. Replaces the previous unauthenticated side-effect
- **Test suite** — 61 tests across 9 files: JWT edge cases (expiry, tamper, algorithm confusion), runtime concurrency, retry logic, inline bot send, type validation

### Security

- **Timing-safe password comparison** — admin password checked with `timingSafeEqual` instead of `===`
- **Shell injection prevention** — `execFileSync` with array args replaces all `exec`/`spawn` string invocations; `sanitizeProcessName` and `sanitizeFilename` validate inputs before use
- **Path traversal blocked** — `assertWithinBase` enforces all workspace file operations stay within `/{workspaces}/{tenantId}/`
- **Cross-tenant guards added to all mutating routes** — `requireOwnTenant` now applied to: `/agent/provision`, `/agent/setup`, `/agent/provider`, `/agent/start-trial`, `/agent/process/stop`, `/agent/processes/:tenantId`, `/agent/marketplace/deploy`, `/agent/trial-expire/:tenantId`
- **`walletAddress` stripped from public status endpoint** — `GET /agent/status/:tenantId` no longer returns wallet address in its response
- **Trial status endpoint made read-only** — removed `deprovision()` + `blockPhone()` side-effects from unauthenticated `GET /agent/trial-status/:tenantId`
- **`AIR_URL` renamed to `AIR_BASE_URL`** — moved from source to environment variable with no hardcoded fallback
- **`looksLikeFinalReport()` rewritten** — checks punctuation, list markers, markdown headings, and length to prevent premature loop exits
- **CORS locked to production origin** — `agentr.online` only in production; unrestricted in development

### Fixed

- `health.ts` was imported in `index.ts` but the file contained only a stub — replaced with a full observability implementation
- Database migration runner now iterates all migration files in order instead of loading a single hardcoded file

## [0.1.0] - 2026-03-21

### Added
- **Multi-tenant agent platform** — one deployment serves unlimited users, each fully isolated
- **63-tool agent runtime** — deploy code, manage Telegram, execute on-chain TON actions
- **Agent Swarm** — `swarm_execute` spawns parallel sub-agents (coder, executor, reviewer, researcher, writer)
- **Full deploy pipeline** — `workspace_write` → `code_execute` → `process_start` → live public URL in one turn
- **TON Connect 2.0** — pay for credits with TON directly from the dashboard
- **React dashboard** — workspace editor, marketplace, credit management, agent config
- **GramJS MTProto userbot** — full Telegram account access (messages, media, groups, stories, gifts)
- **DeDust & STON.fi integration** — DEX quotes and swaps via agent tool calls
- **TON DNS tools** — check, auction, bid, link, resolve `.ton` domains
- **Persistent agent memory** — `memory_read` / `memory_write` backed by `MEMORY.md`
- **Workspace sandbox** — per-tenant file system with path traversal protection
- **Multi-provider LLM support** — Anthropic Claude, Moonshot Kimi, OpenAI
- **Anthropic prompt caching** — ~80% input token savings on system prompts
- **Context compaction** — automatic safe trimming prevents context overflow on long tasks
- **Credit system** — per-call deduction by provider cost
- **Agent Marketplace** — browse, install, and publish agent configurations
- **OTP + 2FA auth flow** — secure Telegram login via phone code and optional 2FA
- **PM2 process isolation** — each deployed process namespaced per tenant

### Security
- Removed `mock_payment: true` bypass from auth responses
- Replaced hardcoded server IP with `SERVER_PUBLIC_IP` environment variable
- Replaced absolute dist path with `path.join(__dirname, 'dist')` in dashboard server
- Agent no longer instructed to embed user secrets as string literals in scripts

[Unreleased]: https://github.com/daraijaola/agentr/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/daraijaola/agentr/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/daraijaola/agentr/releases/tag/v0.1.0
