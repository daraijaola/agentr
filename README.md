<p align="center">
  <img src="./agentr-logo.png" alt="AGENTR" width="320" />
</p>

<p align="center">
  <strong>The multi-tenant AI agent platform that builds, deploys, and manages autonomous agents on TON — through conversation.</strong>
</p>

<p align="center">
  <a href="https://agentr.online"><img src="https://img.shields.io/badge/Live-agentr.online-0098EA?style=flat-square" alt="Live"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT"/></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20+-brightgreen?style=flat-square" alt="Node"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square" alt="TypeScript"/></a>
  <a href="https://ton.org"><img src="https://img.shields.io/badge/Built_on-TON-0098EA?style=flat-square&logo=ton&logoColor=white" alt="TON"/></a>
</p>

<p align="center">
  <a href="https://agentr.online">🌐 Platform</a> · 
  <a href="https://t.me/theagent_r1">💬 Demo Agent</a> · 
  <a href="#quick-start">🚀 Quick Start</a>
</p>

---

## What is AGENTR?

AGENTR is not just an AI agent — it's the **infrastructure** that runs AI agents for everyone.

Think of it this way: other tools give one person one agent. AGENTR gives every user their own fully isolated agent, wallet, sandbox, and deployment environment — managed from a single platform.

Tell your agent *"build me a Telegram bot that tracks TON prices and host it"* — it writes the code, installs dependencies, deploys via PM2, and sends you the live link. No terminal. No config files. Just conversation.

---

## Why AGENTR Wins

<table>
<tr>
<td align="center" width="25%"><br>🏗️<br><b>Multi-Tenant</b><br><br>One platform, infinite agents. Every user gets a fully isolated sandbox, TON wallet, and runtime.<br><br></td>
<td align="center" width="25%"><br>🐝<br><b>Agent Swarm</b><br><br>Orchestrator spawns Coder, Executor, and Reviewer sub-agents that work in parallel — not sequentially.<br><br></td>
<td align="center" width="25%"><br>🤖<br><b>Bot Factory</b><br><br>Agent talks to BotFather, writes the code, deploys it, and hands you a live Telegram bot — in one message.<br><br></td>
<td align="center" width="25%"><br>🌐<br><b>Web Deploy</b><br><br>Agent builds websites, deploys them on your server, and gives you a public link instantly.<br><br></td>
</tr>
</table>

---

## Live Demo

> Send **"Build me a crypto dashboard and host it"** to [@theagent_r1](https://t.me/theagent_r1) on Telegram and watch it happen in real time.

---

## How It Works

### The Agent Loop

```
User message → AgentRuntime → LLM (Claude/Moonshot) → Tool calls → Result → Reply
```

### Swarm Mode

```
User: "Build me a landing page for my project and host it"

Orchestrator agent invokes swarm_execute:
├── Coder sub-agent    →  writes index.html + CSS (parallel)
├── Coder sub-agent    →  writes Express server (parallel)
└── Executor sub-agent →  generates npm install commands (parallel)

Orchestrator then:
├── workspace_write    →  saves files to /sessions/{tenantId}/
├── code_execute       →  runs: npm install express
├── process_start      →  PM2 deploys on assigned port
└── replies            →  "Live at http://[server]:8081 ✅"
```

### Bot Factory

```
User: "Create a TON price tracker Telegram bot"

Agent:
├── create_telegram_bot  →  talks to BotFather, gets token
├── workspace_write      →  writes complete bot code
├── code_execute         →  npm install node-telegram-bot-api
├── process_start        →  deploys bot via PM2
├── process_logs         →  verifies it's running
└── replies              →  "@YourNewBot is live ✅"
```

---

## Platform Architecture

```
agentr/
├── packages/
│   ├── core/               # Agent runtime, tool registry, LLM client
│   │   ├── src/agent/      # Agentic loop, context management
│   │   ├── src/llm/        # Anthropic + Moonshot + OpenAI (prompt caching)
│   │   ├── src/tools/      # 63 tools per tenant
│   │   │   ├── telegram/   # Messaging, bot creation, media
│   │   │   ├── deploy/     # code_execute, process_start/stop/logs
│   │   │   ├── workspace/  # Sandboxed file system
│   │   │   ├── ton/        # Wallet, transfers, DNS
│   │   │   └── swarm/      # swarm_execute — parallel sub-agents
│   │   └── src/workspace/  # Per-tenant path isolation
│   ├── factory/            # Tenant provisioning, wallet generation, DB
│   └── api/                # Hono HTTP API (auth, agent, credits)
├── apps/
│   └── dashboard/          # React + Vite — workspace editor, credits UI
└── sessions/
    └── {tenantId}/         # Isolated sandbox per user
        ├── SOUL.md         # Personality (immutable by agent)
        ├── IDENTITY.md     # Name and bio (immutable by agent)
        ├── STRATEGY.md     # Rules (immutable by agent)
        └── MEMORY.md       # Persistent memory (agent-writable)
```

---

## Tool Registry (63 tools per tenant)

| Category | Count | Key Tools |
|---|---|---|
| Telegram | 20+ | `send_message`, `create_telegram_bot`, `get_messages`, `send_media` |
| Deploy | 6 | `code_execute`, `process_start`, `process_stop`, `process_logs`, `process_list`, `process_restart` |
| Workspace | 8 | `workspace_read`, `workspace_write`, `workspace_delete`, `workspace_list` |
| TON Blockchain | 8 | `wallet_balance`, `send_ton`, `jetton_transfer`, `dns_resolve` |
| Swarm | 1 | `swarm_execute` — roles: coder, executor, researcher, reviewer, writer |
| Memory | 2 | `memory_read`, `memory_write` |
| Web | 2 | `http_fetch`, `json_api` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Runtime | TypeScript, custom agentic loop |
| LLM | Anthropic Claude (prompt caching), Moonshot, OpenAI |
| Telegram | GramJS (MTProto userbot) |
| Process Management | PM2 — tenant-namespaced per process |
| Database | PostgreSQL + Drizzle ORM |
| API | Hono |
| Frontend | React + Vite + Tailwind |
| TON | @ton/core, TON Connect 2.0 |
| Monorepo | pnpm workspaces |

---

## AGENTR vs Single-User Tools

| Feature | AGENTR | Single-user agent tools |
|---|---|---|
| Multi-tenant | ✅ Fully isolated per user | ❌ One instance only |
| Web Dashboard | ✅ React UI, workspace editor | ❌ SSH / CLI only |
| Credits System | ✅ TON payments, per-call tracking | ❌ No billing layer |
| Agent Swarm | ✅ Parallel sub-agents | ❌ Sequential only |
| Bot Factory | ✅ Creates & deploys new bots | ⚠️ Limited |
| Website Deploy | ✅ Build + host + public URL | ❌ Not supported |
| TON Wallet | ✅ One wallet generated per tenant | ⚠️ Shared or manual |
| Workspace UI | ✅ Edit SOUL/IDENTITY/STRATEGY in dashboard | ❌ Manual file editing |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL
- PM2 (`npm install -g pm2`)
- Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)
- Anthropic or Moonshot API key

### Setup

```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
pnpm install

# Configure environment
cp .env.example .env
# Set: DATABASE_URL, ANTHROPIC_API_KEY, TELEGRAM_API_ID, TELEGRAM_API_HASH

# Build all packages
pnpm build

# Start
pm2 start packages/api/dist/index.js --name agentr-api
pm2 start apps/dashboard/dist/index.js --name agentr-dashboard
```

### First Agent

1. Open the dashboard and sign in with your Telegram phone number
2. Complete OTP verification — your agent is provisioned instantly
3. A TON wallet is generated and assigned to your account
4. Open Telegram — your agent is live and listening
5. Send: `"Build me a Telegram bot that shows the BTC price"` — watch it happen

---

## Workspace Files

Each agent's personality and behavior is configured via markdown files:

| File | Purpose | Agent Can Edit |
|---|---|---|
| `SOUL.md` | Personality, tone, behavior guidelines | ❌ No |
| `IDENTITY.md` | Agent name, bio, public persona | ❌ No |
| `STRATEGY.md` | Rules, constraints, operating goals | ❌ No |
| `MEMORY.md` | Persistent facts learned over time | ✅ Yes |

Edit all of these from the dashboard — no SSH required.

---

## TON Integration

- **Wallet per tenant** — generated on provisioning, mnemonic encrypted in DB
- **TON Connect 2.0** — dashboard payments and subscription flows
- **Credits system** — tracked per LLM call, deducted per provider cost
- **TON DNS** — agent can register `.ton` domains and link hosted websites
- **Jetton support** — send/receive jettons, check balances

---

## Roadmap

- [ ] Agent Marketplace — publish and monetize custom agents
- [ ] TON Sites hosting — agents deploy to `.ton` domains natively
- [ ] Agent-to-agent payments on TON
- [ ] Swarm v2 — persistent sub-agent memory and handoff
- [ ] MCP server support
- [ ] Mobile app

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <a href="https://agentr.online">agentr.online</a> · <a href="https://t.me/theagent_r1">Telegram Demo</a>
</p>
