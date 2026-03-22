<p align="center">
  <img src="./agentr-logo.png" alt="AGENTR" width="600" />
</p>

<p align="center"><b>The platform that gives everyone their own autonomous AI agent — through conversation alone.</b></p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"></a>
  <a href="https://agentr.online"><img src="https://img.shields.io/badge/Platform-agentr.online-0098EA" alt="Platform"></a>
  <a href="https://ton.org"><img src="https://img.shields.io/badge/Built_on-TON-0098EA?logo=ton&logoColor=white" alt="Built on TON"></a>
  <a href="https://github.com/daraijaola/agentr/actions/workflows/ci.yml"><img src="https://github.com/daraijaola/agentr/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

---

<p align="center">AGENTR is a multi-tenant AI agent platform built natively on TON and Telegram. Sign up, connect your Telegram account, and receive a fully autonomous AI agent — no terminal, no config files, no technical knowledge required. One platform deployment serves unlimited users, each with their own isolated agent, wallet, and workspace.</p>

---

## How It Works

AGENTR is the platform. You are the user. Your agent is the worker.

Sign up on the dashboard → connect your Telegram account via OTP → your agent is live. From that point, everything happens through conversation with your agent on Telegram. The agent has access to 60+ tools — it can write and execute code, deploy applications, manage files, interact with Telegram, and execute on-chain TON actions.

```
You: "Build me a crypto price tracker and host it"

Your agent:
├── workspace_write  →  writes HTML/JS files to your sandbox
├── code_execute     →  installs dependencies
├── process_start    →  deploys via PM2
└── replies          →  "Live at http://your-server:8081"
```

---

## Current Status

AGENTR is in active development. The core agentic loop, tool execution, multi-tenant provisioning, and Telegram integration are working end-to-end. The platform is live at [agentr.online](https://agentr.online) with a demo agent at [@theagent_r1](https://t.me/theagent_r1).

| Component | Status |
|---|---|
| Agent runtime (agentic loop, tool dispatch, context management) | ✅ Working |
| Multi-tenant provisioning (OTP → agent live) | ✅ Working |
| Telegram MTProto integration (GramJS userbot) | ✅ Working |
| 60+ tools (deploy, workspace, Telegram, TON, swarm) | ✅ Working |
| TON wallet per tenant (auto-generated on signup) | ✅ Working |
| PostgreSQL multi-tenant database | ✅ Working |
| React dashboard (workspace editor, agent config) | ✅ Working |
| LLM multi-provider (Anthropic, Moonshot, OpenAI) | ✅ Working |
| CI pipeline (typecheck + build on every push) | ✅ Working |
| Docker build (multi-stage, production-ready) | ✅ Working |
| Agent Swarm (parallel sub-agents) | ✅ Working |
| TON Connect 2.0 payments | 🔧 In Progress |
| Credit deduction system | 🔧 In Progress |
| Agent Marketplace | 🔧 In Progress |
| Persistent memory (SQLite-backed) | 🔧 In Progress |

---

## Features

### Tool Categories

| Category | Count | Tools |
|---|---|---|
| **Deploy** | 6 | `code_execute`, `process_start`, `process_stop`, `process_logs`, `process_list`, `process_restart` |
| **Workspace** | 8 | Sandboxed read/write/delete/list/rename per tenant with path traversal protection |
| **Telegram** | 40+ | Messaging, media, groups, channels, contacts, gifts, stories, polls, stickers, tasks |
| **TON** | 12 | Balance, transactions, jetton ops, NFT list, DEX quotes/swaps (DeDust + STON.fi), DNS |
| **Swarm** | 1 | `swarm_execute` — spawns parallel sub-agents: coder, executor, reviewer, researcher, writer |
| **Memory** | 2 | `memory_read`, `memory_write` — persistent across sessions |
| **Web** | 2 | HTTP fetch, JSON API calls |
| **Bot** | 2 | `create_bot`, `inline_send` — create and operate Telegram bots |

### Agent Swarm

The `swarm_execute` tool lets the orchestrator agent spawn specialized sub-agents in parallel to complete complex tasks faster:

```
swarm_execute({
  task: "Build a trading bot",
  roles: ["coder", "executor", "reviewer"]
})
→ All three agents run simultaneously
→ Results are merged and returned to user
```

### Multi-Tenant Isolation

Every user gets their own:
- **Session directory** — `/sessions/{tenantId}/` with SOUL, IDENTITY, STRATEGY, MEMORY files
- **Workspace sandbox** — isolated file system, path traversal blocked at the API level
- **TON wallet** — auto-generated on provisioning, address stored in DB
- **PM2 namespace** — deployed processes cannot cross tenant boundaries
- **PostgreSQL row** — tenant data fully isolated by `tenant_id`

### Workspace Files

Each agent has four workspace files, editable from the dashboard:

| File | Purpose | Agent Can Edit |
|---|---|---|
| `SOUL.md` | Personality, tone, communication style | No |
| `IDENTITY.md` | Name, bio, public persona | No |
| `STRATEGY.md` | Goals, rules, constraints | No |
| `MEMORY.md` | Persistent facts recalled across all sessions | Yes |

---

## Architecture

```
agentr/
├── packages/
│   ├── core/                    # Agent runtime, LLM client, tools, Telegram, TON
│   │   ├── src/agent/           # Agentic loop, context trimming, observation masking
│   │   ├── src/llm/             # Multi-provider LLM client with prompt caching
│   │   ├── src/telegram/        # GramJS MTProto bridge, flood retry, formatting
│   │   ├── src/ton/             # TON wallet service, transfer, tx lock
│   │   └── src/tools/           # 60+ tools organized by category
│   ├── factory/                 # Tenant provisioning, PostgreSQL, session management
│   │   └── src/migrations/      # SQL schema migrations
│   ├── api/                     # Hono HTTP API — auth (OTP/2FA), agent, health
│   └── dashboard/               # React + Vite frontend
├── sessions/
│   └── {tenantId}/              # Isolated per-user workspace
│       ├── SOUL.md
│       ├── IDENTITY.md
│       ├── STRATEGY.md
│       └── MEMORY.md
├── Dockerfile                   # Multi-stage production build
└── .github/workflows/ci.yml     # Typecheck + build on every push
```

### Tech Stack

| Layer | Technology |
|---|---|
| Agent Runtime | TypeScript, custom agentic loop with tool dispatch |
| LLM Providers | Anthropic Claude (prompt caching), Moonshot Kimi, OpenAI GPT-4o |
| Telegram | GramJS (MTProto userbot — full account access) |
| Process Management | PM2 with per-tenant namespacing |
| Database | PostgreSQL |
| API | Hono |
| Frontend | React + Vite + Tailwind CSS |
| Payments | TON Connect 2.0 |
| Blockchain | TON — wallet, jettons, NFTs, DNS, DEX |
| Monorepo | pnpm workspaces |
| CI | GitHub Actions (typecheck + build) |
| Container | Docker multi-stage build |

---

## Prerequisites

- **Node.js 20+**
- **pnpm** — `npm install -g pnpm`
- **PostgreSQL** — for tenant data
- **PM2** — `npm install -g pm2`
- **Telegram API credentials** — from [my.telegram.org/apps](https://my.telegram.org/apps)
- **LLM API Key** — Anthropic (recommended), Moonshot, or OpenAI

---

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# LLM — pick one
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic

# Telegram (register at my.telegram.org/apps)
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash_here

# Database
DATABASE_URL=postgresql://agentr:agentr@localhost:5432/agentr

# TON
TONAPI_KEY=your_tonapi_key

# Server
SERVER_PUBLIC_IP=your.server.ip
API_PORT=3001
```

### 3. Build

```bash
pnpm build
```

### 4. Start

```bash
# API server
pm2 start packages/api/dist/index.js --name agentr-api

# Dashboard
node packages/dashboard/server.js
```

### 5. Or use Docker

```bash
docker build -t agentr .
docker run -p 3001:3001 -p 5173:5173 --env-file .env agentr
```

### 6. Verify

Open `http://localhost:5173`, sign in with your Telegram phone number, complete OTP verification. Your agent is live. Open Telegram and message it.

---

## Security

| Layer | Protection |
|---|---|
| **Workspace sandbox** | Agent confined to `/sessions/{tenantId}/`, path traversal blocked |
| **Immutable config** | SOUL.md, STRATEGY.md, IDENTITY.md cannot be modified by the agent at runtime |
| **Process isolation** | PM2 processes namespaced per tenant |
| **No hardcoded secrets** | All credentials via environment variables |
| **OTP + 2FA auth** | Telegram login via official MTProto OTP flow with 2FA support |

---

## Roadmap

- [ ] SQLite-backed persistent memory with vector search
- [ ] Real-time TON payment verification for credit top-ups
- [ ] Agent-to-agent communication and task delegation
- [ ] Swarm v2 — persistent state and result handoff between sub-agents
- [ ] MCP server support
- [ ] `.ton` domain hosting — deploy sites to TON DNS natively
- [ ] Dashboard component refactor (modular pages and hooks)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Security Policy

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Links

- **Platform**: [agentr.online](https://agentr.online)
- **Demo Agent**: [@theagent_r1](https://t.me/theagent_r1)
- **Issues**: [GitHub Issues](https://github.com/daraijaola/agentr/issues)
