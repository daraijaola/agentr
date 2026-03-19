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
</p>

---

<p align="center">AGENTR is infrastructure. Sign up, connect your Telegram, and you have a fully autonomous AI agent that can build apps, deploy websites, automate workflows, and execute code — all through conversation. No terminal. No config files. No technical knowledge required. Powered by TON.</p>

### Key Highlights

<table>
<tr>
<td align="center" width="33%"><br><b><ins>Multi-Tenant Platform</ins></b><br>One deployment serves everyone.<br>Every user fully isolated.<br><br></td>
<td align="center" width="33%"><br><b><ins>Agent Swarm</ins></b><br>Orchestrator spawns parallel sub-agents —<br>Coder, Executor, Reviewer — simultaneously.<br><br></td>
<td align="center" width="33%"><br><b><ins>Full Deploy Pipeline</ins></b><br>Write code → install deps → deploy → live URL.<br>All in one conversation turn.<br><br></td>
</tr>
<tr>
<td align="center"><br><b><ins>Web Dashboard</ins></b><br>React UI — configure your agent,<br>edit workspace, manage credits.<br><br></td>
<td align="center"><br><b><ins>Agent Marketplace</ins></b><br>Browse, install, and publish<br>agent templates and tools.<br><br></td>
<td align="center"><br><b><ins>TON Payments</ins></b><br>Pay for credits with TON.<br>TON Connect 2.0 integrated.<br><br></td>
</tr>
</table>

---

## How It Works

AGENTR is the platform. You are the user. Your agent is the worker.

Sign up on the dashboard → connect your Telegram account → your agent is live. From that point, everything happens through conversation with your agent on Telegram. The agent has access to 63 tools — it can write and execute code, deploy applications, manage files, call APIs, and coordinate parallel sub-agents to complete complex tasks faster.

```
You: "Build me a crypto dashboard with live prices and host it"

Your agent:
├── swarm_execute    →  Coder writes HTML/JS, Executor prepares commands (parallel)
├── workspace_write  →  saves files to your isolated sandbox
├── code_execute     →  npm install
├── process_start    →  deploys via PM2
└── replies          →  "Live at http://your-server:8081"
```

---

## Features

### Tool Categories

| Category | Tools | Description |
|---|---|---|
| Deploy | 6 | `code_execute`, `process_start`, `process_stop`, `process_logs`, `process_list`, `process_restart` |
| Workspace | 8 | Sandboxed file read/write/delete/list per tenant, path traversal protection |
| Telegram | 20+ | Messaging, media, group management, full MTProto access |
| TON | 4 | TON Connect payments, credit top-ups, transaction history |
| Swarm | 1 | `swarm_execute` — roles: coder, executor, researcher, reviewer, writer |
| Memory | 2 | `memory_read`, `memory_write` — persistent across sessions |
| Web | 2 | HTTP fetch, JSON API calls |

### Advanced Capabilities

| Capability | Description |
|---|---|
| **Agent Swarm** | Orchestrator spawns specialized sub-agents in parallel — not sequentially |
| **Full Deploy Pipeline** | Agent writes code, installs dependencies, starts processes, returns a live public URL |
| **Multi-Tenant Isolation** | Each user gets their own PM2 namespace, workspace directory, and session |
| **Marketplace** | Browse and install agent configurations and tool packs from the dashboard |
| **Credits System** | Per-call credit tracking deducted by LLM provider cost, topped up via TON |
| **Prompt Caching** | Anthropic prompt caching on system prompts — ~80% input token savings |
| **Persistent Memory** | Agent writes facts to MEMORY.md, recalled across all future sessions |
| **Workspace Editor** | Edit SOUL, IDENTITY, and STRATEGY files directly from the dashboard UI |
| **Context Management** | Automatic context trimming prevents overflow on long agentic tasks |

---

## Prerequisites

- **Node.js 20.0.0+** — [Download](https://nodejs.org/)
- **pnpm** — `npm install -g pnpm`
- **PostgreSQL** — tenant data, sessions, credits
- **PM2** — `npm install -g pm2`
- **LLM API Key** — [Anthropic](https://console.anthropic.com/) (recommended) or [Moonshot](https://platform.moonshot.ai/)
- **Telegram API credentials** — from [my.telegram.org/apps](https://my.telegram.org/apps)

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

Open the dashboard, sign in with your Telegram phone number, complete OTP. Your agent is live instantly. Open Telegram and send:

```
You: /ping
Agent: Online and ready.

You: Build me a landing page and host it
Agent: [writes HTML, deploys server, returns live link]
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
│   │   │   ├── telegram/       # Full MTProto access via GramJS
│   │   │   ├── deploy/         # code_execute, process_start/stop/logs
│   │   │   ├── workspace/      # Sandboxed per-tenant file system
│   │   │   ├── ton/            # TON Connect, payments, credits
│   │   │   └── swarm/          # swarm_execute — parallel sub-agents
│   │   └── src/workspace/      # Path validation, traversal protection
│   ├── factory/                # Tenant provisioning, DB, session management
│   └── api/                    # Hono HTTP API — auth, agent, credits, marketplace
├── apps/
│   └── dashboard/              # React + Vite — workspace editor, marketplace, credits
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
| Agent Runtime | TypeScript, custom agentic loop |
| LLM | Anthropic Claude (prompt caching), Moonshot, OpenAI |
| Telegram | GramJS (MTProto userbot) |
| Process Management | PM2 — tenant-namespaced |
| Database | PostgreSQL + Drizzle ORM |
| API | Hono |
| Frontend | React + Vite + Tailwind |
| Payments | TON Connect 2.0 |
| Monorepo | pnpm workspaces |

---

## Workspace Files

| File | Purpose | Agent Can Edit |
|---|---|---|
| `SOUL.md` | Personality, tone, behavior | No |
| `IDENTITY.md` | Name, bio, public persona | No |
| `STRATEGY.md` | Rules, constraints, goals | No |
| `MEMORY.md` | Persistent facts across sessions | Yes |

---

## Security

| Layer | Protection |
|---|---|
| **Workspace sandbox** | Agent confined to `/sessions/{tenantId}/`, path traversal blocked |
| **Immutable config** | SOUL.md, STRATEGY.md, IDENTITY.md cannot be modified by the agent |
| **Process isolation** | Each deployed process namespaced per tenant, no cross-tenant access |
| **Prompt injection defense** | Tool results sanitized before injecting into context |

---

## Roadmap

- [ ] Agent-to-agent communication and task delegation
- [ ] TON Sites hosting — deploy to `.ton` domains natively
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
