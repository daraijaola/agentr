# Tools Reference

Your agent has access to 63 tools across 8 categories, chained automatically based on your request.

## Deploy & Execute

| Tool | Description |
|---|---|
| `code_execute` | Run bash or Python scripts |
| `process_start` | Start a persistent PM2 process |
| `process_stop` | Stop a running process |
| `process_restart` | Restart a process |
| `process_logs` | Fetch recent process logs |
| `process_list` | List all running processes |
| `serve_static` | Serve static files on a public port |

## Workspace

Sandboxed file system per tenant — path traversal blocked.

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
| `ton_send` | Send TON |
| `ton_get_transactions` | Transaction history |
| `ton_get_price` | Current TON price |
| `jetton_send` | Send jetton tokens |
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

Roles: `coder`, `executor`, `researcher`, `reviewer`, `writer`. All run simultaneously.

## Memory

| Tool | Description |
|---|---|
| `memory_write` | Write to MEMORY.md (persists across sessions) |
| `memory_read` | Read current memory |
