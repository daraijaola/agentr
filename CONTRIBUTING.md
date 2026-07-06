# Contributing to AGENTR

Thank you for your interest in contributing. Every contribution helps — bug fixes, new tools, docs, tests.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
- [Commit Style](#commit-style)
- [Pull Request Process](#pull-request-process)
- [Adding a New Tool](#adding-a-new-tool)
- [Code Style](#code-style)

## Getting Started

1. Fork the repo on GitHub
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/agentr.git`
3. Create a feature branch: `git checkout -b feat/your-feature`
4. Make changes, commit, push, open a PR against `main`

## Development Setup

**Requirements:** Node.js 20+, pnpm, PostgreSQL, PM2, Telegram API credentials, LLM API key

```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
pnpm install
cp .env.example .env
# Fill in .env with your credentials
pnpm build
```

## Project Structure

```
agentr/
├── packages/
│   ├── core/          # Agent runtime, LLM client, tool registry, TON/Telegram integrations
│   ├── factory/       # Tenant provisioning, PostgreSQL, session management
│   └── api/           # Hono HTTP API — auth, agent, marketplace routes
├── packages/dashboard/ # React + Vite dashboard
└── sessions/          # Per-tenant sandboxes (gitignored)
```

## How to Contribute

### Bug Reports
Open a [GitHub Issue](https://github.com/daraijaola/agentr/issues/new?template=bug_report.md) with:
- What you expected
- What actually happened
- Steps to reproduce
- Node.js version and OS

### Feature Requests
Open a [GitHub Issue](https://github.com/daraijaola/agentr/issues/new?template=feature_request.md) describing the use case.

### Code Contributions
- Keep PRs focused — one feature or fix per PR
- Add or update tests where applicable
- Run `pnpm typecheck` before submitting
- Follow the commit style below

## Commit Style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add jetton transfer confirmation step
fix: resolve path traversal in workspace read
chore: update dependencies
docs: add TON DNS setup guide
test: add unit test for swarm orchestrator
refactor: extract LLM client into separate module
```

## Pull Request Process

1. Ensure `pnpm typecheck` passes with no errors
2. Describe what your PR does and why in the description
3. Reference any related issues with `Closes #123`
4. A maintainer will review within 2–3 business days
5. Address review feedback, then it gets merged

## Adding a New Tool

Tools live in `packages/core/src/tools/`. Each tool exports an object matching the `AgentTool` interface:

```typescript
// packages/core/src/tools/my-category/my-tool.ts
import type { AgentTool } from '../types.js'

export const myTool: AgentTool = {
  name: 'my_tool_name',
  description: 'What this tool does — be specific, the agent reads this.',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'The input value' },
    },
    required: ['input'],
  },
  async execute({ input }, context) {
    return { success: true, data: result }
  },
}
```

Then register it in `packages/core/src/tools/index.ts`.

## Code Style

- TypeScript strict mode — no `any` without justification
- Prettier for formatting — run `pnpm prettier --write .` before committing
- Prefer named exports over default exports
- Keep tool `description` fields under 300 chars — they go to the LLM every call
- Never log secrets, tokens, or API keys

## Questions?

Open an issue or reach out via the [demo agent](https://t.me/theagent_r1).
