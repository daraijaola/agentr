# AGENTR - AI Agent Factory for TON & Telegram

## Overview
AGENTR is an AI Agent Factory for TON blockchain and Telegram. It's a pnpm monorepo with four packages:
- **packages/dashboard** - React + Vite frontend (port 5000 in dev)
- **packages/api** - Hono/Node.js REST API backend (port 3001)
- **packages/core** - Shared core logic (Telegram, TON, LLM, wallet, etc.)
- **packages/factory** - Agent factory with Docker and PostgreSQL management

## Architecture
- **Frontend**: React 18 + Vite 6 + TonConnect UI
- **Backend**: Hono on Node.js with zod validation, bcrypt auth
- **Database**: PostgreSQL (via `pg` package in factory)
- **Agent runtime**: Docker containers per agent
- **LLM**: Pluggable (Anthropic, OpenAI, Moonshot/Kimi, AIR)
- **Blockchain**: TON via `@ton/ton`, DeDust, STON.fi SDKs
- **Messaging**: Telegram via gramjs fork

## Development Setup
1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env` and fill in API keys
3. Run frontend: `pnpm --filter @agentr/dashboard dev` (port 5000)
4. Run API: `pnpm --filter @agentr/api dev` (port 3001)
5. Or run all: `pnpm dev` (parallel)

## Workflows
- **Start application**: Runs the dashboard frontend on port 5000 (webview)

## Required Environment Variables
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` or `MOONSHOT_API_KEY` — LLM provider key
- `LLM_PROVIDER` — Active provider (anthropic | openai | moonshot | air)
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` — Telegram app credentials
- `TON_API_KEY` / `TONAPI_KEY` — TON network access
- `DATABASE_URL` — PostgreSQL connection string
- `API_SECRET` — **Required, no fallback** — API HMAC signing secret (generate: `openssl rand -hex 32`)
- `WALLET_ENCRYPTION_KEY` — **Required** — AES-256-GCM key for wallet mnemonics (min 32 chars)
- `ADMIN_PASSWORD` — Admin panel password

## Security Changes (applied)

### 1. Code Execution Sandboxing (`packages/core/src/tools/deploy/code-execute.ts`)
- Removed host `execSync`. Code now runs inside the tenant's Docker container via `docker exec`.
- Container name: `agentr-{tenantId}`. Returns a clear error if container is not running.

### 2. Auth Token Expiry (`packages/api/src/middleware/auth.ts`)
- Added 24-hour TTL to HMAC tokens. Tokens older than 24h are rejected.
- Removed `'changeme'` fallback — API throws 500 if `API_SECRET` is not set.

### 3. Wallet Mnemonic Encryption (`packages/factory/src/factory.ts`)
- Mnemonics are encrypted with AES-256-GCM using `WALLET_ENCRYPTION_KEY` before PostgreSQL storage.
- Stored format: `iv_hex:ciphertext_hex:auth_tag_hex`
- `encryptMnemonic` / `decryptMnemonic` exported from factory.

### 4. Rate Limiter Persistence (`packages/api/src/index.ts`)
- Moved in-memory rate limiter to PostgreSQL (`rate_limits` table). Survives restarts.
- Table added to `packages/factory/src/migrations/001_initial.sql`.

### 5. Input Size Limits (`packages/core/src/llm/client.ts`)
- LLM calls reject if total message payload exceeds 100 KB.
- `code_execute` also rejects code input > 100 KB.

### 6. Sub-agent Tool Restrictions (`packages/core/src/tools/swarm/index.ts`)
- Swarm sub-agents restricted to: `workspace_read`, `workspace_write`, `code_execute`.
- Removed `exec_run`, `exec_install`, `exec_service` from sub-agent tool access.

### 7. AIR LLM Provider (`packages/core/src/llm/client.ts`)
- New `'air'` provider: `https://air-by-agentr.replit.app/api/v1/chat/completions`
- Uses `OPENAI_API_KEY` as the Bearer token. OpenAI-compatible format.

### 8. Plan-based Model Access (`packages/core/src/llm/client.ts`)
- Enforced per-plan model allow-lists for the AIR provider:
  - **Starter**: `claude-sonnet-4-6` only. 24h expiry from provisioning.
  - **Pro**: `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.5-pro`
  - **Ultra / Elite / Enterprise**: all models including `claude-opus-4-6`, `gpt-5.2`, `gemini-3.1-pro-preview`
- Plan + provisionedAt passed through `LLMConfig` → `AgentRuntime` → `AgentFactory`.

## Key Files
- `packages/dashboard/vite.config.ts` — Vite config (port 5000, host 0.0.0.0, allowedHosts: true)
- `packages/api/src/index.ts` — API entry point + PostgreSQL rate limiter
- `packages/api/src/middleware/auth.ts` — HMAC auth with 24h TTL
- `packages/factory/src/factory.ts` — Agent factory with mnemonic encryption
- `packages/core/src/llm/client.ts` — LLM client with AIR provider + plan enforcement
- `packages/core/src/tools/swarm/index.ts` — Swarm tool (restricted sub-agent tools)
- `packages/core/src/tools/deploy/code-execute.ts` — Docker-sandboxed code execution
- `packages/factory/src/migrations/001_initial.sql` — DB schema (includes rate_limits)
