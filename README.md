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

<p align="center">
AGENTR is a multi-tenant AI agent platform built natively on TON and Telegram.<br/>
Sign up, connect your Telegram account, and get a fully autonomous AI agent instantly.<br/>
No code. No config. No technical knowledge required.
</p>

<p align="center">
  <strong><a href="https://agentr.online">Try it at agentr.online</a></strong>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <strong><a href="https://t.me/theagent_r1">Demo agent @theagent_r1</a></strong>
</p>

---

## What Is AGENTR

AGENTR gives every user their own autonomous AI agent that lives on their Telegram account and acts as a real user — not a bot. The agent has access to 60+ tools and can take real actions: write and deploy code, manage Telegram, send TON, swap tokens on DEXes, bid on .ton domains — all triggered by plain conversation.

One platform deployment serves unlimited users. Every user is fully isolated — their own wallet, their own workspace, their own agent.

---

## How It Works

**1. Sign up** at [agentr.online](https://agentr.online) with your Telegram phone number — OTP, no passwords.

**2. Agent goes live** — within seconds, a fully autonomous AI agent is running on your Telegram account.

**3. Talk to it** — message your agent in plain English. It executes everything end to end.

```
You → "Build me a crypto price tracker and host it"

Agent:
├── workspace_write  → writes HTML/JS to your private sandbox
├── code_execute     → installs dependencies
├── process_start    → deploys via PM2
└── "Your tracker is live at http://your-server:8081"
```

---

## What Your Agent Can Do

**Build & Deploy**
- Write and run code (Python, Node.js, bash)
- Deploy apps with a live public URL
- Create and manage Telegram bots
- View logs, restart processes, manage deployments

**TON Blockchain**
- Send and receive TON and jetton tokens
- Swap tokens on DeDust and STON.fi
- Register and manage `.ton` domains
- Check balances, prices, and transaction history

**Telegram Automation**
- Send messages, media, voice, stickers, GIFs
- Create and manage groups and channels
- Schedule messages and recurring tasks
- React, poll, quiz, manage contacts and gifts

**Agent Swarm**
- Spawn parallel sub-agents for complex tasks
- Roles: coder, executor, reviewer, researcher, writer
- All agents run simultaneously — results merged into one reply

---

## Agent Swarm

```
You → "Build a Telegram trading bot with alerts and a web dashboard"

Orchestrator spawns simultaneously:
├── coder      → writes the bot and dashboard
├── executor   → deploys while coder is still writing
└── reviewer   → catches bugs and fixes them
```

---

## Platform Features

| Feature | Description |
|---|---|
| **Multi-tenant** | One deployment, unlimited users — every user fully isolated |
| **Workspace Editor** | Edit your agent's personality, rules, and memory from the dashboard |
| **Agent Marketplace** | Browse and deploy community agent configurations in one click |
| **Credits System** | Pay-as-you-go via TON Connect — top up with TON from the dashboard |
| **LLM Choice** | Switch between Claude, Kimi, and GPT-4o from the dashboard |
| **Persistent Memory** | Your agent remembers facts across every conversation |
| **Prompt Caching** | Anthropic prompt caching — ~80% savings on input tokens |

---

## Isolation & Security

Every user gets:
- **Private workspace** — `/sessions/{tenantId}/` with path traversal blocked at the API level
- **TON wallet** — auto-generated on signup, unique per user
- **PM2 namespace** — deployed processes cannot cross tenant boundaries
- **Immutable soul files** — SOUL, IDENTITY, STRATEGY cannot be modified by the agent at runtime
- **OTP + 2FA auth** — Telegram login via official MTProto flow

---

## Agent Workspace

| File | Purpose | Agent Can Edit |
|---|---|---|
| `SOUL.md` | Personality, tone, communication style | No |
| `IDENTITY.md` | Name, bio, public persona | No |
| `STRATEGY.md` | Goals, rules, constraints | No |
| `MEMORY.md` | Facts recalled across all sessions | Yes |

---

## Architecture

```
agentr/
├── packages/
│   ├── core/              # Agent runtime, LLM client, 60+ tools, Telegram, TON
│   │   ├── src/agent/     # Agentic loop, tool registry, context management
│   │   ├── src/llm/       # Multi-provider LLM client with prompt caching
│   │   ├── src/telegram/  # GramJS MTProto bridge
│   │   ├── src/ton/       # TON wallet, transfers, transaction lock
│   │   └── src/tools/     # deploy, workspace, telegram, ton, dedust, stonfi, dns, swarm
│   ├── factory/           # Tenant provisioning, PostgreSQL, session management
│   ├── api/               # Hono HTTP API — auth (OTP + 2FA), agent routes, health
│   └── dashboard/         # React + Vite — workspace editor, marketplace, credits
├── sessions/{tenantId}/   # Isolated per-user workspace (gitignored)
├── docs/                  # Setup and reference docs
├── Dockerfile             # Multi-stage production build
└── .github/workflows/     # CI — typecheck + build on every push
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Runtime | TypeScript, custom agentic loop with tool dispatch |
| LLM | Anthropic Claude (prompt caching), Moonshot Kimi, OpenAI GPT-4o |
| Telegram | GramJS — MTProto userbot, full account access |
| Process Management | PM2 — per-tenant namespaced |
| Database | PostgreSQL |
| API | Hono |
| Frontend | React + Vite |
| Payments | TON Connect 2.0 |
| Blockchain | TON — wallet, jettons, NFTs, DEX, DNS |
| Monorepo | pnpm workspaces |
| CI | GitHub Actions — typecheck + build |
| Container | Docker multi-stage build |

---

## Status

| Component | Status |
|---|---|
| Agent runtime — agentic loop, tool dispatch, context management | ✅ Live |
| Multi-tenant provisioning — OTP to agent live in seconds | ✅ Live |
| Telegram MTProto integration — GramJS userbot | ✅ Live |
| 60+ tools — deploy, workspace, Telegram, TON, swarm, DNS | ✅ Live |
| TON wallet per user — auto-generated on signup | ✅ Live |
| React dashboard — workspace editor, marketplace, credits | ✅ Live |
| LLM multi-provider — Claude, Kimi, GPT-4o | ✅ Live |
| Agent Swarm — parallel sub-agents | ✅ Live |
| CI pipeline + Docker | ✅ Live |
| TON Connect payments + credit top-up | 🔧 In Progress |
| Agent Marketplace | 🔧 In Progress |

---

## Roadmap

- [ ] TON payment verification for real-time credit top-ups
- [ ] Agent Marketplace — publish and earn from community agents
- [ ] Agent-to-agent communication and task delegation
- [ ] Swarm v2 — persistent state and handoff between sub-agents
- [ ] MCP server support
- [ ] `.ton` domain hosting — deploy sites natively to TON DNS

---

## Docs

- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Tools Reference](docs/tools.md)
- [Deployment](docs/deployment.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## License

MIT — see [LICENSE](LICENSE) for details.
