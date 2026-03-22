<p align="center">
  <img src="./agentr-logo.png" alt="AGENTR" width="600" />
</p>

<p align="center"><b>AI Agent Factory for TON & Telegram</b></p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"></a>
  <a href="https://agentr.online"><img src="https://img.shields.io/badge/Platform-agentr.online-0098EA" alt="Platform"></a>
  <a href="https://ton.org"><img src="https://img.shields.io/badge/Built_on-TON-0098EA?logo=ton&logoColor=white" alt="Built on TON"></a>
  <a href="https://github.com/daraijaola/agentr/actions/workflows/ci.yml"><img src="https://github.com/daraijaola/agentr/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

---

<p align="center">AGENTR is a multi-tenant AI agent platform built natively on TON and Telegram. Sign up at <a href="https://agentr.online">agentr.online</a>, connect your Telegram account, and get a fully autonomous AI agent — no terminal, no config files, no technical knowledge required. One platform deployment serves unlimited users, each with their own isolated agent, TON wallet, and workspace.</p>

---

## What It Does

Your agent lives on your Telegram account and acts as a real user — not a bot. Tell it what you want in plain English and it handles everything end to end:

```
You: "Build me a crypto price tracker and host it"

Agent:
├── workspace_write  →  writes HTML/JS to your sandbox
├── code_execute     →  installs dependencies
├── process_start    →  deploys via PM2
└── replies          →  "Live at http://your-server:8081"
```

It can build Telegram bots, deploy web apps, manage your TON wallet, swap tokens on DeDust and STON.fi, bid on .ton domains, send messages, manage groups — all from a single conversation.

---

## Live Platform

- **Website**: [agentr.online](https://agentr.online)
- **Demo Agent**: [@theagent_r1](https://t.me/theagent_r1)

---

## Architecture

```
agentr/
├── packages/
│   ├── core/                 # Agent runtime, LLM client, all tools, Telegram, TON
│   │   ├── src/agent/        # Agentic loop, tool registry, context management
│   │   ├── src/llm/          # Multi-provider LLM client (Anthropic, Moonshot, OpenAI)
│   │   ├── src/telegram/     # GramJS MTProto bridge, flood retry, formatting
│   │   ├── src/ton/          # TON wallet, transfers, transaction lock
│   │   └── src/tools/        # 60+ tools: deploy, workspace, telegram, ton, swarm, dns
│   ├── factory/              # Tenant provisioning, PostgreSQL, session management
│   ├── api/                  # Hono HTTP API — auth (OTP + 2FA), agent routes, health
│   └── dashboard/            # React + Vite frontend
│       └── src/
│           ├── App.tsx
│           ├── components/   # WorkspaceTab, MarketplaceTab, CreditsTab, BotsTab, ActivityTab
│           ├── lib/          # API helpers and shared types
│           └── styles/       # Global CSS
├── sessions/
│   └── {tenantId}/           # Isolated per-user workspace
│       ├── SOUL.md           # Agent personality (immutable by agent)
│       ├── IDENTITY.md       # Agent name and bio (immutable by agent)
│       ├── STRATEGY.md       # Rules and constraints (immutable by agent)
│       └── MEMORY.md         # Persistent memory (agent-writable)
├── docs/                     # Setup and reference documentation
├── Dockerfile                # Multi-stage production build
└── .github/workflows/ci.yml  # Typecheck + build on every push
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Runtime | TypeScript, custom agentic loop |
| LLM Providers | Anthropic Claude (prompt caching), Moonshot Kimi, OpenAI GPT-4o |
| Telegram | GramJS — MTProto userbot, full account access |
| Process Management | PM2 — per-tenant namespaced processes |
| Database | PostgreSQL |
| API | Hono |
| Frontend | React + Vite |
| Payments | TON Connect 2.0 |
| Blockchain | TON — wallet, jettons, NFTs, DEX, DNS |
| Monorepo | pnpm workspaces |
| CI | GitHub Actions |
| Container | Docker multi-stage build |

---

## Tools

60+ tools across 8 categories — all available to the agent every turn:

| Category | Tools |
|---|---|
| **Deploy** | `code_execute`, `process_start`, `process_stop`, `process_logs`, `process_list`, `process_restart`, `serve_static` |
| **Workspace** | `workspace_write`, `workspace_read`, `workspace_list`, `workspace_delete`, `workspace_rename`, `workspace_info` |
| **Telegram** | Messaging, media, groups, channels, contacts, gifts, stories, polls, stickers, scheduled tasks |
| **TON** | Balance, send, transactions, jetton ops, NFT list, price, DEX quotes |
| **DEX** | DeDust swap/quote, STON.fi swap/quote/search/trending |
| **TON DNS** | Check, auction, bid, link, unlink, resolve `.ton` domains |
| **Swarm** | `swarm_execute` — parallel sub-agents: coder, executor, reviewer, researcher, writer |
| **Memory** | `memory_read`, `memory_write` — persistent across all sessions |

---

## Multi-Tenant Isolation

Every user gets:
- **Workspace sandbox** — `/sessions/{tenantId}/`, path traversal blocked at API level
- **TON wallet** — auto-generated on signup, address stored in DB
- **PM2 namespace** — deployed processes cannot cross tenant boundaries
- **PostgreSQL row** — all data isolated by `tenant_id`
- **Immutable soul files** — SOUL, IDENTITY, STRATEGY cannot be modified by the agent

---

## Agent Swarm

`swarm_execute` spawns multiple specialized sub-agents in parallel:

```
You: "Build a Telegram trading bot with price alerts"

swarm_execute → spawns simultaneously:
├── coder      → writes the bot code
├── executor   → installs deps and deploys
└── reviewer   → checks for errors
```

All agents run at the same time. Results are merged and returned in one reply.

---

## Quick Start

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- pnpm — `npm install -g pnpm`
- PostgreSQL
- PM2 — `npm install -g pm2`
- Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)
- One LLM API key (Anthropic recommended)

### 1. Clone and Install

```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
```

```env
# LLM — pick one
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5

# Telegram
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash_here

# TON
TON_ENDPOINT=https://toncenter.com/api/v2/jsonRPC
TON_API_KEY=your_key
TONAPI_KEY=your_key

# Database
DATABASE_URL=postgresql://agentr:agentr@localhost:5432/agentr

# Server
API_PORT=3001
API_SECRET=changeme
SERVER_PUBLIC_IP=your.server.ip
```

### 3. Build

```bash
pnpm build
```

### 4. Start

```bash
pm2 start packages/api/dist/index.js --name agentr-api
node packages/dashboard/server.js
```

### 5. Docker

```bash
docker build -t agentr .
docker run -p 3001:3001 -p 5173:5173 --env-file .env agentr
```

### 6. Sign In

Open `http://localhost:5173`, enter your Telegram phone number, complete OTP. Your agent is live. Message it on Telegram.

---

## Security

| Layer | Protection |
|---|---|
| Workspace sandbox | Agent confined to `/sessions/{tenantId}/` — path traversal blocked |
| Immutable files | SOUL.md, STRATEGY.md, IDENTITY.md cannot be modified by the agent |
| Process isolation | PM2 processes namespaced per tenant |
| No hardcoded secrets | All credentials via environment variables |
| OTP + 2FA auth | Telegram login via MTProto with 2FA support |

---

## Current Status

| Component | Status |
|---|---|
| Agent runtime (agentic loop, tool dispatch, context management) | ✅ Working |
| Multi-tenant provisioning (OTP → agent live) | ✅ Working |
| Telegram MTProto integration (GramJS userbot) | ✅ Working |
| 60+ tools (deploy, workspace, Telegram, TON, swarm) | ✅ Working |
| TON wallet per tenant (auto-generated on signup) | ✅ Working |
| PostgreSQL multi-tenant database | ✅ Working |
| React dashboard (workspace editor, marketplace, credits) | ✅ Working |
| LLM multi-provider (Anthropic, Moonshot, OpenAI) | ✅ Working |
| Agent Swarm (parallel sub-agents) | ✅ Working |
| CI pipeline + Docker build | ✅ Working |
| TON Connect 2.0 payments | 🔧 In Progress |
| Credit deduction system | 🔧 In Progress |
| Agent Marketplace | 🔧 In Progress |

---

## Roadmap

- [ ] Real-time TON payment verification for credit top-ups
- [ ] Agent-to-agent communication and task delegation
- [ ] Swarm v2 — persistent state and result handoff between sub-agents
- [ ] MCP server support
- [ ] `.ton` domain hosting — deploy sites to TON DNS natively
- [ ] SQLite-backed persistent memory with vector search

---

## Docs

- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Tools Reference](docs/tools.md)
- [Deployment](docs/deployment.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on submitting PRs and adding new tools.

---

## Security Policy

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

---

## License

MIT — see [LICENSE](LICENSE) for details.
