<p align="center">
  <img src="./agentr-logo.png" alt="AGENTR" width="600" />
</p>

<p align="center"><b>Autonomous AI Agent · Telegram + TON</b></p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/stage-Live-brightgreen" alt="Beta">
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
  <strong><a href="https://t.me/theagent_r1">Demo agent @Theagent_r1</a></strong>
</p>

> **Status: Live** — The platform is fully operational and accepting users.

---

## What Is AGENTR

AGENTR gives every user their own autonomous AI agent that lives on their Telegram account and acts as a real user — not a bot. The agent has access to 125 tools and can take real actions: write and deploy code, manage Telegram, send TON, swap tokens on DEXes, bid on .ton domains — all from plain conversation.

One deployment, unlimited users. Every user is fully isolated — their own wallet, their own workspace, their own agent.

---

## How It Works

**1. Sign up** at [agentr.online](https://agentr.online) with your Telegram phone number — OTP login, no passwords.

**2. Agent goes live** — a fully autonomous AI agent is running on your Telegram account within seconds.

**3. Talk to it** — message your agent in plain English. It executes everything end to end.

```
You → "Build me a crypto price tracker and host it"

Agent:
├── workspace_write  → writes the app to your private sandbox
├── code_execute     → installs dependencies
├── process_start    → deploys via PM2
└── "Your tracker is live — TON, ETH, BTC updating every 30s."
```

---

## What Your Agent Can Do

**Build & Deploy**
- Write and run code (Python, Node.js, bash)
- Deploy apps with live public URLs
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
- React, poll, quiz, manage contacts

---

## Platform Status

| Component | Status |
|---|---|
| Agent runtime — agentic loop, tool dispatch, context management | ✅ Live |
| Multi-tenant provisioning — OTP → agent live in seconds | ✅ Live |
| Telegram MTProto integration — GramJS userbot | ✅ Live |
| 125 tools — deploy, workspace, Telegram, TON, DNS | ✅ Live |
| TON wallet per user — AES-256-GCM encrypted mnemonic | ✅ Live |
| Conversation persistence — survives restarts via PostgreSQL | ✅ Live |
| JWT authentication — HS256 via jose | ✅ Live |
| Cream dashboard — workspace, marketplace, credits, model picker | ✅ Live |
| LLM multi-model — Claude, GPT-4o, Gemini via AIR gateway | ✅ Live |
| Per-user model selection — persisted, plan-gated | ✅ Live |
| TON Connect payments + credit system | ✅ Live |
| Agent Marketplace | ✅ Live |
| CI pipeline | ✅ Live |
| Agent Swarm — parallel sub-agents | 🔄 Beta |
| MCP server support | 🗓 Planned |
| `.ton` domain hosting | 🗓 Planned |
| Agent-to-agent communication | 🗓 Planned |

---

## Plans

| Plan | Credits/mo | Model Access |
|---|---|---|
| Free | 500 (one-time) | Claude Haiku 4.5 |
| Starter | 1,200 | + Gemini Flash, GPT-4o mini |
| Pro | 2,800 | + Claude Sonnet, GPT-4o |
| Ultra | 4,000 | + Gemini Pro |
| Elite | 6,000 | + Claude Opus |
| Enterprise | 50,000 | All models |

---

## Self-Hosting

```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
cp .env.example .env   # fill in API keys and DB URL
pnpm install
pnpm build
pnpm start
```

Requires: Node.js 20+, PostgreSQL 15+, Docker (for sandboxing).

---

## License

MIT — see [LICENSE](LICENSE) for details.

Demo agent: [@Theagent_r1](https://t.me/theagent_r1) · Platform: [agentr.online](https://agentr.online)
