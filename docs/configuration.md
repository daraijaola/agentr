# Configuration

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | One of these | Anthropic Claude API key |
| `MOONSHOT_API_KEY` | One of these | Moonshot Kimi API key |
| `OPENAI_API_KEY` | One of these | OpenAI API key |
| `LLM_PROVIDER` | ✅ | Active provider: `anthropic`, `moonshot`, `openai` |
| `LLM_MODEL` | Optional | Override default model |
| `TELEGRAM_API_ID` | ✅ | From my.telegram.org/apps |
| `TELEGRAM_API_HASH` | ✅ | From my.telegram.org/apps |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `API_PORT` | Optional | API port (default: 3001) |
| `SERVER_PUBLIC_IP` | ✅ | Your server's public IP |

## LLM Providers

### Anthropic Claude (Recommended)
Best reasoning and tool use. Prompt caching saves ~80% on input tokens.
```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### Moonshot Kimi
Fast and cost-effective for high-volume workloads.
```env
LLM_PROVIDER=moonshot
MOONSHOT_API_KEY=...
LLM_MODEL=kimi-k2
```

## Agent Workspace Files

| File | Purpose | Agent Can Edit |
|---|---|---|
| `SOUL.md` | Personality and tone | No |
| `IDENTITY.md` | Name and bio | No |
| `STRATEGY.md` | Rules and constraints | No |
| `MEMORY.md` | Persistent facts | Yes |
| `USER.md` | Owner preferences | Yes |

## Credit Costs

| Provider | Cost per call |
|---|---|
| Moonshot Kimi | 3 credits |
| OpenAI GPT-4o | 9 credits |
| Anthropic Claude | 13 credits |
