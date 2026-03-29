# Configuration

## Environment Variables

### Core — Required

| Variable | Description |
|---|---|
| `TELEGRAM_API_ID` | From [my.telegram.org/apps](https://my.telegram.org/apps) |
| `TELEGRAM_API_HASH` | From [my.telegram.org/apps](https://my.telegram.org/apps) |
| `DATABASE_URL` | PostgreSQL connection string e.g. `postgresql://agentr:pass@localhost:5432/agentr` |
| `API_SECRET` | JWT signing secret — generate with `openssl rand -hex 32` |
| `WALLET_ENCRYPTION_KEY` | AES-256-GCM key for wallet mnemonic encryption — min 32 chars, generate with `openssl rand -hex 32` |
| `SERVER_PUBLIC_IP` | Your server's public IP — used in agent deploy links |
| `ADMIN_PASSWORD` | Password for admin endpoints (`/agent/admin/*`) |

### LLM — Pick One

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | Active provider: `air`, `anthropic`, `moonshot`, `openai` |
| `LLM_MODEL` | Override default model (optional) |
| `AIR_BASE_URL` | AIR proxy base URL e.g. `https://your-air-domain/api/v1` (required if `LLM_PROVIDER=air`) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `MOONSHOT_API_KEY` | Moonshot Kimi API key |
| `OPENAI_API_KEY` | OpenAI API key (also used as auth key for AIR provider) |

### TON Blockchain

| Variable | Description |
|---|---|
| `TON_ENDPOINT` | RPC endpoint (default: `https://toncenter.com/api/v2/jsonRPC`) |
| `TON_API_KEY` | toncenter.com API key |
| `TONAPI_KEY` | tonapi.io API key |

### Optional

| Variable | Default | Description |
|---|---|---|
| `API_PORT` | `3001` | HTTP API listen port |
| `AGENT_MAX_ITER` | `12` | Max LLM loop iterations per message (1–20) |
| `SESSIONS_PATH` | `/root/agentr/sessions` | Telegram session storage |
| `WORKSPACES_PATH` | `/root/agentr/workspaces` | Per-tenant workspace root |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `AGENT_IMAGE` | `agentr-agent:latest` | Docker image for tenant sandboxes |
| `AGENT_CONTAINER_MEMORY` | `512m` | Docker memory limit per tenant container |
| `AGENT_CONTAINER_CPUS` | `0.5` | Docker CPU quota per tenant container |

### OpenAI Codex (Optional)

| Variable | Description |
|---|---|
| `OPENAI_CODEX_ACCESS_TOKEN` | Codex access token |
| `OPENAI_CODEX_REFRESH_TOKEN` | Codex refresh token |
| `OPENAI_CODEX_EXPIRES` | Codex token expiry timestamp |

---

## LLM Providers

### AIR (Recommended for AGENTR deployments)
Internal OpenAI-compatible proxy — fastest, lowest cost, purpose-built for this platform.
```env
LLM_PROVIDER=air
LLM_MODEL=claude-sonnet-4-6
AIR_BASE_URL=https://air.agentr.online/api/v1
OPENAI_API_KEY=air-your-key-here
```

### Anthropic Claude
Best reasoning and tool use. Prompt caching saves ~80% on input tokens.
```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...
```

### Moonshot Kimi
Fast and cost-effective for high-volume workloads.
```env
LLM_PROVIDER=moonshot
LLM_MODEL=kimi-k2
MOONSHOT_API_KEY=...
```

### OpenAI
```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
OPENAI_API_KEY=sk-...
```

---

## Agent Workspace Files

| File | Purpose | Agent Can Edit |
|---|---|---|
| `SOUL.md` | Personality and tone | No |
| `IDENTITY.md` | Name and bio | No |
| `STRATEGY.md` | Rules and constraints | No |
| `MEMORY.md` | Persistent facts | Yes |
| `USER.md` | Owner preferences | Yes |

---

## Credit Costs

| Provider | Cost per LLM call |
|---|---|
| AIR / Moonshot Kimi | 3 credits |
| OpenAI GPT-4o | 9 credits |
| Anthropic Claude | 13 credits |
