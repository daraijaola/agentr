# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-21

### Added
- **Multi-tenant agent platform** — one deployment serves unlimited users, each fully isolated
- **63-tool agent runtime** — deploy code, manage Telegram, execute on-chain TON actions
- **Agent Swarm** — `swarm_execute` spawns parallel sub-agents (coder, executor, reviewer, researcher, writer)
- **Full deploy pipeline** — `workspace_write` → `code_execute` → `process_start` → live public URL in one turn
- **TON Connect 2.0** — pay for credits with TON directly from the dashboard
- **React dashboard** — workspace editor, marketplace, credit management, agent config
- **GramJS MTProto userbot** — full Telegram account access (messages, media, groups, stories, gifts)
- **DeDust & STON.fi integration** — DEX quotes and swaps via agent tool calls
- **TON DNS tools** — check, auction, bid, link, resolve `.ton` domains
- **Persistent agent memory** — `memory_read` / `memory_write` backed by `MEMORY.md`
- **Workspace sandbox** — per-tenant file system with path traversal protection
- **Multi-provider LLM support** — Anthropic Claude, Moonshot Kimi, OpenAI
- **Anthropic prompt caching** — ~80% input token savings on system prompts
- **Context compaction** — automatic safe trimming prevents context overflow on long tasks
- **Credit system** — per-call deduction by provider cost
- **Agent Marketplace** — browse, install, and publish agent configurations
- **OTP + 2FA auth flow** — secure Telegram login via phone code and optional 2FA
- **PM2 process isolation** — each deployed process namespaced per tenant

### Security
- Removed `mock_payment: true` bypass from auth responses
- Replaced hardcoded server IP with `SERVER_PUBLIC_IP` environment variable
- Replaced absolute dist path with `path.join(__dirname, 'dist')` in dashboard server
- Agent no longer instructed to embed user secrets as string literals in scripts

[Unreleased]: https://github.com/daraijaola/agentr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/daraijaola/agentr/releases/tag/v0.1.0
