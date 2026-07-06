# Tools Reference

Your agent has access to 63 tools across 8 categories, chained automatically based on your request.

## Deploy & Execute

| Tool | Description |
|---|---|
| `exec_run` | Run any bash command. Automatically routed through the tenant's Docker sandbox when running |
| `exec_install` | Install packages via apt, pip, npm, or docker pull — sandboxed when container is active |
| `code_execute` | Run Python or Node.js scripts inline |
| `process_start` | Start a persistent PM2 process |
| `process_stop` | Stop a running process |
| `process_restart` | Restart a process |
| `process_logs` | Fetch recent process logs |
| `process_list` | List all running processes |
| `serve_static` | Serve static files on a public port |

## Workspace

Sandboxed file system per tenant — path traversal blocked at the API level.

| Tool | Description |
|---|---|
| `workspace_write` | Write a file |
| `workspace_read` | Read a file |
| `workspace_list` | List files |
| `workspace_delete` | Delete a file |
| `workspace_rename` | Rename or move a file |

## Telegram

Full MTProto access. Agent operates as the connected Telegram account.

- **Messaging** — send, edit, delete, forward, pin, schedule, search
- **Chats** — dialogs, history, join/leave channels, chat info
- **Groups** — create, participants, moderation
- **Media** — photo, GIF, sticker, voice, audio transcription, vision
- **Gifts** — send, receive, transfer collectibles
- **Interactive** — polls, quizzes, dice, reactions
- **Profile** — bio, username, photo
- **Tasks** — scheduled autonomous tasks

## TON Blockchain

| Tool | Description |
|---|---|
| `ton_get_balance` | Get TON balance |
| `ton_send` | Send TON (requires explicit user confirmation) |
| `ton_get_transactions` | Transaction history |
| `ton_get_price` | Current TON price |
| `jetton_send` | Send jetton tokens (requires explicit user confirmation) |
| `jetton_balances` | All jetton balances |
| `nft_list` | List NFTs in wallet |
| `dex_quote` | DEX swap quote |

## TON DNS

| Tool | Description |
|---|---|
| `dns_check` | Check .ton domain availability |
| `dns_start_auction` | Start domain auction |
| `dns_bid` | Bid on auction |
| `dns_link` | Link domain to site/wallet |
| `dns_resolve` | Resolve a .ton domain |

## Swarm

| Tool | Description |
|---|---|
| `swarm_execute` | Spawn parallel sub-agents |

Roles: `coder`, `executor`, `researcher`, `reviewer`, `writer`. All run simultaneously — results merged into one reply.

## Memory

| Tool | Description |
|---|---|
| `memory_write` | Write to MEMORY.md (persists across sessions and server restarts) |
| `memory_read` | Read current memory |

---

## Notes

- **TON transfers require confirmation** — `ton_send`, `jetton_send`, and DEX swaps always pause and ask the user before executing. All other tools run without confirmation.
- **`exec_run` sandbox routing** — when Docker is enabled and the tenant container is running, bash commands execute inside the isolated container (`--network=none`, `--cap-drop=ALL`, `--read-only`). Without Docker, commands run on the host.
- **Conversation memory** — full conversation history is persisted to PostgreSQL and restored automatically when the agent resumes after a server restart.
