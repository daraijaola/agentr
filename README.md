<p align="center">
  <img src="./agentr-logo.png" alt="AGENTR" width="600" />
</p>

<p align="center"><b>The multi-tenant AI agent platform that builds, deploys, and manages autonomous agents on TON — through conversation.</b></p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"></a>
  <a href="https://agentr.online"><img src="https://img.shields.io/badge/Platform-agentr.online-0098EA" alt="Platform"></a>
  <a href="https://ton.org"><img src="https://img.shields.io/badge/Built_on-TON-0098EA?logo=ton&logoColor=white" alt="Built on TON"></a>
</p>

---

<p align="center">AGENTR is infrastructure. Not just an AI agent — a platform that provisions and runs AI agents for multiple users simultaneously. Each tenant gets their own isolated agent runtime, TON wallet, Telegram userbot, and deployment sandbox. Tell your agent to build a Telegram bot, deploy a website, or automate a workflow — it handles everything end to end, through conversation alone.</p>

### Key Highlights

<table>
<tr>
<td align="center" width="33%"><br><b><ins>Multi-Tenant Platform</ins></b><br>One deployment, infinite agents.<br>Every user fully isolated.<br><br></td>
<td align="center" width="33%"><br><b><ins>Agent Swarm Mode</ins></b><br>Orchestrator spawns parallel sub-agents<br>(Coder, Executor, Reviewer)<br><br></td>
<td align="center" width="33%"><br><b><ins>Full Deploy Pipeline</ins></b><br>Write code → install deps → PM2 deploy → live URL.<br>One conversation turn.<br><br></td>
</tr>
<tr>
<td align="center"><br><b><ins>Bot Factory</ins></b><br>Agent creates and deploys<br>new Telegram bots autonomously<br><br></td>
<td align="center"><br><b><ins>Web Dashboard</ins></b><br>React UI with workspace editor,<br>credits system, agent config<br><br></td>
<td align="center"><br><b><ins>TON Native</ins></b><br>Wallet per tenant, TON Connect,<br>credits system, TON DNS<br><br></td>
</tr>
</table>

---

## Features

### Tool Categories

| Category | Tools | Description |
|---|---|---|
| Telegram | 20+ | Messaging, media, group management, bot creation via BotFather |
| Deploy | 6 | `code_execute`, `process_start`, `process_stop`, `process_logs`, `process_list`, `process_restart` |
| Workspace | 8 | Sandboxed file read/write/delete/list, path traversal protection |
| TON Blockchain | 8 | Wallet balance, send TON, jetton transfers, TON DNS |
| Swarm | 1 | `swarm_execute` — parallel sub-agents: coder, executor, researcher, reviewer, writer |
| Memory | 2 | `memory_read`, `memory_write` — persistent MEMORY.md across sessions |
| Web | 2 | HTTP fetch, JSON API calls |

### Advanced Capabilities

| Capability | Description |
|---|---|
| **Agent Swarm** | Orchestrator spawns specialized sub-agents running in parallel — not sequentially |
| **Bot Factory** | Agent talks to BotFather, writes code, installs deps, deploys, and returns a live bot |
| **Website Deploy** | Agent builds HTML/JS, starts an HTTP server, returns a public URL |
| **Multi-Tenant Isolation** | Each user gets their own PM2 process namespace, workspace directory, and TON wallet |
| **Prompt Caching** | Anthropic prompt caching on system prompts — ~80% input token savings |
| **Persistent Memory** | Agent writes to MEMORY.md across sessions |
| **Context Management** | Automatic context trimming to prevent overflow |
| **TON Connect 2.0** | Dashboard payments and subscription flows |
| **Credits System** | Per-call credit tracking, deducted by provider cost |
| **Workspace Editor** | Edit SOUL/IDENTITY/STRATEGY from the dashboard UI |

---

## Prerequisites

- **Node.js 20.0.0+** — [Download](https://nodejs.org/)
- **pnpm** — `npm install -g pnpm`
- **PostgreSQL** — database for tenants, sessions, credits
- **PM2** — `npm install -g pm2`
- **LLM API Key** — [Anthropic](https://console.anthropic.com/) (recommended) or [Moonshot](https://platform.moonshot.ai/)
- **Telegram API credentials** — from [my.telegram.org/apps](https://my.telegram.org/apps)
- **Telegram Account** — dedicated account recommended

---

## Quick Start

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

Fill in your `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/agentr
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash_here
LLM_PROVIDER=anthropic
```

### 3. Build and Start

```bash
pnpm build
pm2 start packages/api/dist/index.js --name agentr-api
pm2 start apps/dashboard/dist/index.js --name agentr-dashboard
```

### 4. Verify

Open the dashboard, sign in with your Telegram phone number, and complete OTP. Your agent is provisioned instantly with a TON wallet and 63 tools. Open Telegram and send:

```
You: /ping
Agent: Online and ready.

You: Build me a Telegram bot that shows the BTC price
Agent: [creates bot, writes code, deploys via PM2, returns @YourNewBot]
```

---

## Architecture

```
agentr/
├── packages/
│   ├── core/                   # Agent runtime, tool registry, LLM client
│   │   ├── src/agent/          # Agentic loop, context management
│   │   ├── src/llm/            # Multi-provider LLM client (prompt caching)
│   │   ├── src/tools/          # 63 tools per tenant
│   │   │   ├── telegram/       # Messaging, bot creation via BotFather
│   │   │   ├── deploy/         # code_execute, process_start/stop/logs
│   │   │   ├── workspace/      # Sandboxed per-tenant file system
│   │   │   ├── ton/            # Wallet, transfers, TON DNS
│   │   │   └── swarm/          # swarm_execute — parallel sub-agents
│   │   └── src/workspace/      # Path validation, traversal protection
│   ├── factory/                # AgentFactory — provisioning, DB, wallet gen
│   └── api/                    # Hono HTTP API — auth, agent, credits routes
├── apps/
│   └── dashboard/              # React + Vite — workspace editor, credits UI
└── sessions/
    └── {tenantId}/             # Isolated sandbox per user
        ├── SOUL.md             # Personality (immutable by agent)
        ├── IDENTITY.md         # Name and bio (immutable by agent)
        ├── STRATEGY.md         # Rules and constraints (immutable by agent)
        └── MEMORY.md           # Persistent memory (agent-writable)
```

### Tech Stack

| Layer | Technology |
|---|---|
| Agent Runtime | TypeScript, custom agentic loop with tool calling |
| LLM | Anthropic Claude (prompt caching), Moonshot, OpenAI |
| Telegram | GramJS (MTProto userbot) |
| Process Management | PM2 — tenant-namespaced processes |
| Database | PostgreSQL + Drizzle ORM |
| API | Hono |
| Frontend | React + Vite + Tailwind |
| TON | @ton/core, TON Connect 2.0 |
| Monorepo | pnpm workspaces |

---

## Workspace Files

Each agent's personality and behavior is configured via markdown files editable from the dashboard:

| File | Purpose | Agent Can Edit |
|---|---|---|
| `SOUL.md` | Personality, tone, behavior guidelines | No |
| `IDENTITY.md` | Agent name, bio, public persona | No |
| `STRATEGY.md` | Rules, constraints, operating goals | No |
| `MEMORY.md` | Persistent facts learned over time | Yes |

---

## TON Integration

- **Wallet per tenant** — generated on provisioning, mnemonic encrypted in DB
- **TON Connect 2.0** — dashboard payments and subscription flows
- **Credits system** — tracked per LLM call, deducted per provider cost
- **TON DNS** — agent can register `.ton` domains and link hosted websites
- **Jetton support** — send/receive jettons, check balances

---

## Security

| Layer | Protection |
|---|---|
| **Workspace sandbox** | Agent confined to `/sessions/{tenantId}/`, path traversal blocked |
| **Immutable config** | SOUL.md, STRATEGY.md, IDENTITY.md cannot be modified by the agent |
| **Process isolation** | Each deployed process namespaced per tenant — no cross-tenant access |
| **Wallet encryption** | Mnemonic encrypted at rest in PostgreSQL |
| **Prompt injection defense** | Tool results sanitized before injecting into context |

---

## Roadmap

- [ ] Agent Marketplace — publish and monetize custom agents
- [ ] TON Sites hosting — deploy to `.ton` domains natively
- [ ] Agent-to-agent payments on TON
- [ ] Swarm v2 — persistent sub-agent memory and handoff
- [ ] MCP server support
- [ ] Mobile app

---

## Contributing

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Open a Pull Request against `main`

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Support

- **Platform**: [agentr.online](https://agentr.online)
- **Demo Agent**: [@theagent_r1](https://t.me/theagent_r1)
- **Issues**: [GitHub Issues](https://github.com/daraijaola/agentr/issues)
