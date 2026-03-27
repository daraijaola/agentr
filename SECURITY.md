# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | ✅ Yes     |
| 0.1.x   | ⚠️ Critical fixes only |
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
| **Authentication** | HS256 JWT via `jose` — 24h TTL, algorithm pinned, expiry enforced server-side |
| **Ownership enforcement** | `requireOwnTenant` guard on every mutating route — JWT `tenantId` must match request `tenantId` |
| **Workspace sandbox** | All file access confined to `/{workspaces}/{tenantId}/` — `assertWithinBase` blocks path traversal at read/write/delete |
| **Shell injection prevention** | `execFileSync` with array args throughout; `sanitizeProcessName` and `sanitizeFilename` validate all inputs |
| **Docker sandbox** | Each tenant agent runs in an isolated container: `--network=none`, `--cap-drop=ALL`, `--read-only` |
| **Rate limiting** | 120 req/min global per IP; 30 msg/min per tenant on `/agent/message`; 10 req/min on admin endpoints — all PostgreSQL-backed |
| **Wallet encryption** | Mnemonic phrases encrypted with AES-256-GCM (`WALLET_ENCRYPTION_KEY`) before storage — no plaintext fallback |
| **Timing-safe comparisons** | Admin password verified with `timingSafeEqual` to prevent timing attacks |
| **Process isolation** | Each deployed process PM2-namespaced per tenant — no cross-tenant process access |
| **Credential handling** | User secrets written to workspace `.env` files, loaded via environment variables — never hardcoded in scripts |
| **Immutable soul files** | `SOUL.md`, `STRATEGY.md`, `IDENTITY.md` cannot be modified by the agent at runtime |
| **Error sanitization** | `safeError()` strips stack traces from all API error responses |
| **CORS** | Locked to `agentr.online` in production — unrestricted only in development |
| **Token rotation** | Dev bearer tokens can be rotated on demand via `POST /agent/dev/logout` |

## Known Limitations

- The agent runs as the provisioned user's Telegram account — all actions it takes are under that account's authority
- Docker sandboxing requires Docker installed on the host — the platform falls back gracefully without it, but `exec_run` commands run on the host in that case
- Rate limiting uses the `rate_limits` PostgreSQL table — if the database is unavailable, limits fail open (requests are allowed)
