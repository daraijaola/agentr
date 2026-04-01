<p align="center">
  <img src="./agentr-logo.png" alt="AGENTR" width="600" />
</p>

<p align="center"><strong>Autonomous AI Agent · Telegram + TON</strong></p>

<p align="center">
  <a href="https://github.com/daraijaola/agentr/actions/workflows/ci.yml">
    <img src="https://github.com/daraijaola/agentr/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License">
  </a>
  <img src="https://img.shields.io/badge/Node.js-20%20%7C%2022-brightgreen" alt="Node.js 20 | 22">
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript 5.7">
  <a href="https://agentr.online">
    <img src="https://img.shields.io/badge/Platform-agentr.online-0098EA" alt="agentr.online">
  </a>
  <a href="https://ton.org">
    <img src="https://img.shields.io/badge/Built_on-TON-0098EA?logo=ton&logoColor=white" alt="TON">
  </a>
</p>

<p align="center">
  <strong><a href="https://agentr.online">agentr.online</a></strong>
  &nbsp;·&nbsp;
  <strong><a href="https://t.me/theagent_r1">@Theagent_r1 — live demo</a></strong>
</p>

---

AGENTR is a multi-tenant autonomous AI agent platform built natively on TON and Telegram. Every user gets their own agent — provisioned in seconds, isolated by tenant, and able to take real actions across 125 tools with no code required.

One deployment. Unlimited users. Each user has their own wallet, their own sandbox, their own agent running on their actual Telegram account.

---

## How It Works

Sign up at [agentr.online](https://agentr.online) with your Telegram number. Verify with an OTP. Your agent goes live immediately and starts responding in your Telegram messages — it acts as you, not as a bot.

```
You → "Build a crypto price dashboard and deploy it"

Agent:
├── workspace_write   → scaffolds the app in your private sandbox
├── exec_install      → installs dependencies
├── exec_run          → starts the server via PM2
├── serve_static      → generates a live public URL
└── "Done — your dashboard is live at https://abc123.agentr.app"
```

---

## What Your Agent Can Do

**Build & Deploy**  
Write and run code (Node.js, Python, bash), deploy apps with public URLs, manage processes, create Telegram bots, run tests, serve static sites — all from conversation.

**TON Blockchain**  
Send and receive TON and jetton tokens, check balances and transaction history, get token prices and charts, view NFTs, compile and deploy smart contracts to testnet.

**Telegram Automation**  
Send messages, photos, voice, video, GIFs, stickers. Create groups and channels, manage members and admins, set usernames, schedule messages, send polls and quizzes, manage contacts and folders.

**DNS & Domains**  
Register `.ton` domains, bid in auctions, link wallets and sites to domains, resolve and manage existing records.

**Memory**  
Persistent per-user memory written to `MEMORY.md` — your agent remembers context across every session.

---

## Tech Stack

| Layer | What runs there |
|---|---|
| Agent Runtime | Autonomous agentic loop — tool dispatch, context management, retry logic |
| Telegram | GramJS over MTProto — full userbot, not bot API |
| LLM | Claude, GPT-4o, Gemini — routed via AIR gateway, per-user model selection |
| TON | `@ton/ton` — wallets, jettons, smart contracts, DEX integration |
| API | Hono on Node.js — JWT auth (HS256), credit gating, multi-tenant routing |
| Database | PostgreSQL — tenants, sessions, credits, conversation history |
| Dashboard | Vanilla JS cream UI — workspace, marketplace, model picker, credits |
| Monorepo | pnpm workspaces — `api`, `core`, `factory`, `dashboard` |

---

## CI

Every push and pull request to `main` runs the full pipeline on **Node.js 20 and 22**:

```
typecheck → build → test
```

- **Typecheck** — `tsc --noEmit` across all packages
- **Build** — `tsc` compilation for `api`, `core`, `factory`
- **Test** — Vitest unit tests covering tools, LLM client, auth, TON, DNS

Passing CI on both Node versions is required to merge.

---

## Plans

| Plan | Credits | Model Access |
|---|---|---|
| Free | 500 (24hr trial), then 8 msgs/day | Claude Haiku 4.5 |
| Starter | 1,200 / mo | + Gemini Flash 2.5, GPT-4o mini |
| Pro | 2,800 / mo | + Claude Sonnet 4.5, GPT-4o |
| Ultra | 4,000 / mo | + Gemini Pro 2.5 |
| Elite | 6,000 / mo | + Claude Opus 4.5 |
| Enterprise | 50,000 / mo | All models |

Payment is via TON Connect — decentralized, no credit card required.

---

## Self-Hosting

```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
cp .env.example .env
# Set OPENAI_API_KEY, DATABASE_URL, JWT_SECRET, TELEGRAM_API_ID, TELEGRAM_API_HASH
pnpm install
pnpm build
pnpm start
```

**Requirements:** Node.js 20+, PostgreSQL 15+, pnpm 9+

---

## Repository Layout

```
packages/
  api/         Hono HTTP API — auth, agent routes, credits, webhooks
  core/        Agent runtime, tool registry, 125 tools, LLM client
  factory/     Multi-tenant provisioner — spawns and resumes agents
  dashboard/   Cream dashboard UI + landing page (vanilla JS)
```

---

## License

MIT — see [LICENSE](LICENSE).

Demo: [@Theagent_r1](https://t.me/theagent_r1) · Platform: [agentr.online](https://agentr.online)
