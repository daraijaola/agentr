# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Yes     |
| < 0.1.0 | ❌ No      |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue — especially anything involving:
- Tenant isolation bypass (cross-user data access)
- Workspace path traversal
- Auth bypass or token forgery
- Agent prompt injection leading to privilege escalation
- TON wallet or payment manipulation

Please report it privately:

1. Open a [GitHub private security advisory](https://github.com/daraijaola/agentr/security/advisories/new)
2. Or email: **security@agentr.online**
3. Include a description of the vulnerability and steps to reproduce
4. We will acknowledge receipt within 48 hours
5. We aim to patch critical issues within 7 days

We appreciate responsible disclosure and will credit reporters in the changelog if desired.

## Security Architecture

| Layer | Protection |
|---|---|
| **Workspace sandbox** | Agent file access confined to `/sessions/{tenantId}/` — path traversal blocked at read/write/delete |
| **Immutable soul files** | `SOUL.md`, `STRATEGY.md`, `IDENTITY.md` cannot be modified by the agent at runtime |
| **Process isolation** | Each deployed process is PM2-namespaced per tenant — no cross-tenant process access |
| **Credential handling** | User secrets written to workspace `.env` files, loaded via environment variables — never hardcoded in scripts |
| **Server IP** | Public IP loaded from `SERVER_PUBLIC_IP` environment variable — not hardcoded in source |
| **Auth** | OTP + optional 2FA required for Telegram login — no mock or bypass modes in production |
| **Tool result sanitization** | Tool outputs sanitized before injection into LLM context to reduce prompt injection risk |

## Known Limitations

- The agent runs as the provisioned user's Telegram account — all actions it takes are under that account's authority
- Code execution (`code_execute`, `process_start`) runs on the host system — production deployments should use Docker or VM isolation
- Rate limiting on the API is basic — production deployments should add a reverse proxy with stricter limits
