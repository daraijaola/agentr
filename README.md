<p align="center">
  <img src="./agentr-logo.png" alt="AGENTR" width="600" />
</p>

<p align="center"><strong>AI agent infrastructure for Telegram, TON, and real tool execution.</strong></p>

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
  <a href="https://www.badtheorylabs.com/runtime">
    <img src="https://img.shields.io/badge/Powered_by-BTL_Runtime-111111" alt="BTL Runtime">
  </a>
  <a href="https://ton.org">
    <img src="https://img.shields.io/badge/Built_on-TON-0098EA?logo=ton&logoColor=white" alt="TON">
  </a>
</p>

<p align="center">
  <strong><a href="https://agentr.online">agentr.online</a></strong>
  &nbsp;|&nbsp;
  <strong><a href="https://github.com/daraijaola/agentr">GitHub</a></strong>
</p>

---

AGENTR is a multi-tenant AI agent platform that runs from Telegram and takes real actions in isolated workspaces. A user signs in with Telegram, gets a dedicated agent session, and can ask it to build websites, write code, run commands, deploy apps, create Telegram bots, manage TON workflows, and coordinate sub-agents from one conversation.

The runtime is powered by [BTL Runtime](https://www.badtheorylabs.com/runtime), an OpenAI-compatible inference gateway. AGENTR routes model calls through BTL Runtime, tracks token-based credits, and exposes plan-aware model access inside the dashboard.

---

## Product Overview

AGENTR turns a Telegram conversation into an operating surface for building and automation.

```text
User message in Telegram
        |
        v
AGENTR runtime receives the message once, loads tenant context, and calls BTL Runtime
        |
        v
The agent selects tools: write files, execute commands, manage TON, create bots, deploy apps
        |
        v
Tools run inside the user's isolated Docker workspace
        |
        v
The final result is sent back to Telegram and reflected in the dashboard
```

Every tenant has:

- A Telegram-authenticated agent session.
- A dedicated Docker workspace for command execution and generated projects.
- Persistent memory and conversation state.
- TON wallet support for payments and on-chain actions.
- Credit accounting based on actual model usage.
- Plan-based model access through BTL Runtime.

---

## Core Capabilities

### Build and Deploy

- Generate full websites and mini apps.
- Write and edit files in the tenant workspace.
- Run Node.js, Python, shell commands, installs, tests, and build scripts.
- Start and manage long-running processes with PM2.
- Serve generated apps and static sites.
- Inspect logs and recover from failed commands.

### Telegram Automation

- Respond from the user's Telegram context.
- Work in private chats and groups when mentioned.
- Avoid bot loops and duplicate replies.
- Send text, media, polls, stickers, voice, and files.
- Create and manage groups, channels, bots, schedules, contacts, and message flows.

### TON Workflows

- Provision a TON wallet for each user.
- Connect wallet flows through TON Connect.
- Check balances and transaction history.
- Send TON and jettons.
- Register and manage `.ton` domains.
- Support token-gated billing and plan upgrades.

### Agent Swarm

- Spawn specialized sub-agents for larger tasks.
- Split work between coder, executor, reviewer, and researcher roles.
- Merge results back into one coherent response.
- Keep execution isolated to the tenant's workspace.

---

## BTL Runtime Integration

AGENTR uses BTL Runtime as its primary OpenAI-compatible model gateway.

Set these environment variables:

```bash
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.badtheorylabs.com/v1
LLM_API_KEY=your_btl_runtime_key
LLM_MODEL=btl-2
```

Current model access in the product:

| Plan | Included Credits | Default Route | Notes |
|---|---:|---|---|
| Free | 1,000 | `btl-2` | Default model for new users |
| Starter | 10,000 / mo | `deepseek-v4-flash` | Faster DeepSeek route for active builders |
| Pro | 30,000 / mo | `deepseek-v4-pro` | Higher-capacity DeepSeek route |
| Elite | 100,000 / mo | `deepseek-r1-0528` | Reasoning-focused route |

Credits are token based, so short responses do not consume a full message-sized unit. The dashboard displays the active model, available credits, wallet state, and plan.

---

## Architecture

| Package | Responsibility |
|---|---|
| `packages/api` | Hono HTTP API, auth, tenant status, credits, billing, dashboard endpoints |
| `packages/core` | Agent runtime, tool registry, LLM client, Telegram/TON tools, memory |
| `packages/factory` | Tenant provisioning, Docker container lifecycle, session resume |
| `packages/dashboard` | Landing page, dashboard UI, wallet connect, model/plan surfaces |

Key runtime pieces:

- **Telegram user client:** GramJS/MTProto session for user-native Telegram operation.
- **Agent loop:** Model call, tool selection, execution, retries, final response.
- **Tool registry:** File, terminal, deployment, Telegram, TON, memory, web, and process tools.
- **Docker isolation:** One workspace/container boundary per tenant for safer command execution.
- **Credit service:** Token usage is converted into plan credits and persisted per tenant.
- **Dashboard:** Browser UI for onboarding, status, model access, credits, and wallet actions.

---

## Repository Layout

```text
.
|-- packages/
|   |-- api/          # Hono API, auth, credits, billing, dashboard endpoints
|   |-- core/         # Agent runtime, tools, LLM client, Telegram and TON logic
|   |-- factory/      # Multi-tenant provisioning and Docker session management
|   `-- dashboard/    # Landing page and app dashboard
|-- docs/             # Additional implementation notes
|-- workspaces/       # Tenant workspaces in local/server deployments
|-- sessions/         # Telegram/runtime session storage
|-- Dockerfile
|-- Dockerfile.agent
|-- ecosystem.config.cjs
`-- pnpm-workspace.yaml
```

---

## Requirements

- Node.js 20 or 22
- pnpm 9+
- PostgreSQL 15+
- Docker with access to `/var/run/docker.sock`
- Telegram API credentials from [my.telegram.org](https://my.telegram.org)
- BTL Runtime API key
- TON API credentials for wallet and chain features

---

## Environment

Create `.env` from `.env.example` and set the required values:

```bash
cp .env.example .env
```

Minimum required variables:

```bash
DATABASE_URL=postgresql://agentr:agentr@localhost:5432/agentr
API_SECRET=replace_with_32_byte_secret
WALLET_ENCRYPTION_KEY=replace_with_32_byte_secret

TELEGRAM_API_ID=your_telegram_api_id
TELEGRAM_API_HASH=your_telegram_api_hash

LLM_PROVIDER=openai
LLM_BASE_URL=https://api.badtheorylabs.com/v1
LLM_API_KEY=your_btl_runtime_key
LLM_MODEL=btl-2

TON_ENDPOINT=https://toncenter.com/api/v2/jsonRPC
TON_API_KEY=your_toncenter_key
TONAPI_KEY=your_tonapi_key

DOCKER_SOCKET=/var/run/docker.sock
AGENT_IMAGE=agentr-agent:latest
SESSIONS_PATH=/path/to/agentr/sessions
WORKSPACES_PATH=/path/to/agentr/workspaces
SERVER_PUBLIC_IP=your_public_server_ip
```

Generate secrets with:

```bash
openssl rand -hex 32
```

---

## Local Development

Install dependencies:

```bash
pnpm install
```

Build all packages:

```bash
pnpm build
```

Run type checks:

```bash
pnpm typecheck
```

Run tests:

```bash
pnpm test
```

Start development services:

```bash
pnpm dev
```

Build the agent container image:

```bash
docker build -f Dockerfile.agent -t agentr-agent:latest .
```

---

## Production Runtime

The deployed service runs the API and dashboard as PM2 processes:

```bash
pm2 start ecosystem.config.cjs
pm2 status
```

Common production commands:

```bash
pnpm --filter @agentr/dashboard build
pm2 restart agentr-dashboard --update-env

pnpm --filter @agentr/api build
pm2 restart agentr-api --update-env
```

Dashboard:

- `/` serves the landing page.
- `/app` serves the authenticated dashboard.

API:

- Handles Telegram sign-in and OTP verification.
- Provisions or resumes tenant agents.
- Tracks credits, model access, wallet state, and tenant status.

---

## Credit and Billing Model

AGENTR uses credits as a user-facing budget over BTL Runtime usage.

- New users receive 1,000 credits.
- Usage is charged from actual model token consumption.
- Plans unlock higher BTL routes and larger monthly credit balances.
- TON Connect is used for wallet linking and upgrade payments.
- The dashboard shows the active plan, model, available credits, and wallet address.

---

## Safety and Isolation

AGENTR is designed around tenant isolation and controlled execution:

- Each user gets a separate Docker workspace.
- Tool execution is scoped to that tenant workspace.
- Telegram reply handling deduplicates inbound events to avoid repeated responses.
- Group replies require mention or direct prompt context.
- Bot-loop protections prevent the agent from recursively replying to bots.
- Wallet secrets are encrypted with `WALLET_ENCRYPTION_KEY`.

---

## CI

The CI pipeline runs on Node.js 20 and 22:

```text
typecheck -> build -> test
```

Use these commands locally before pushing:

```bash
pnpm typecheck
pnpm build
pnpm test
```

---

## License

MIT. See [LICENSE](LICENSE).
