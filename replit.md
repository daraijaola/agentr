# AGENTR - AI Agent Factory for TON & Telegram

## Overview
AGENTR is an AI Agent Factory for TON blockchain and Telegram. It's a pnpm monorepo with four packages:
- **packages/dashboard** - React + Vite frontend (port 5000 in dev)
- **packages/api** - Hono/Node.js REST API backend (port 3001)
- **packages/core** - Shared core logic (Telegram, TON, LLM, wallet, etc.)
- **packages/factory** - Agent factory with Docker and PostgreSQL management

## Architecture
- **Frontend**: React 18 + Vite 6 + TonConnect UI
- **Backend**: Hono on Node.js with zod validation, bcrypt auth
- **Database**: PostgreSQL (via `pg` package in factory)
- **Agent runtime**: Docker containers per agent
- **LLM**: Pluggable (Anthropic, OpenAI, Moonshot/Kimi)
- **Blockchain**: TON via `@ton/ton`, DeDust, STON.fi SDKs
- **Messaging**: Telegram via gramjs fork

## Development Setup
1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env` and fill in API keys
3. Run frontend: `pnpm --filter @agentr/dashboard dev` (port 5000)
4. Run API: `pnpm --filter @agentr/api dev` (port 3001)
5. Or run all: `pnpm dev` (parallel)

## Workflows
- **Start application**: Runs the dashboard frontend on port 5000 (webview)

## Required Environment Variables
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` or `MOONSHOT_API_KEY` - LLM provider key
- `LLM_PROVIDER` - Active provider (anthropic | openai | moonshot)
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` - Telegram app credentials
- `TON_API_KEY` / `TONAPI_KEY` - TON network access
- `DATABASE_URL` - PostgreSQL connection string
- `API_SECRET` - API authentication secret
- `ADMIN_PASSWORD` - Admin panel password

## Key Files
- `packages/dashboard/vite.config.ts` - Vite config (port 5000, host 0.0.0.0, allowedHosts: true)
- `packages/api/src/index.ts` - API entry point
- `packages/factory/src/factory.ts` - Agent factory
- `packages/core/src/index.ts` - Core exports
