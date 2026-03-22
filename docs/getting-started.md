# Getting Started

AGENTR gives you a fully autonomous AI agent that runs on your Telegram account. This guide gets you from zero to a live agent in under 10 minutes.

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- PostgreSQL database
- PM2 (`npm install -g pm2`)
- Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)
- At least one LLM API key (Anthropic recommended)

## 1. Clone and Install
```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
pnpm install
```

## 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash_here
DATABASE_URL=postgresql://user:password@localhost:5432/agentr
SERVER_PUBLIC_IP=your.server.ip
```

## 3. Build and Start
```bash
pnpm build
pm2 start packages/api/dist/index.js --name agentr-api
node packages/dashboard/server.js &
```

## 4. Sign In

Open `http://your-server:5173`, enter your Telegram phone number, complete OTP, and your agent is live.

## Next Steps

- [Configuration](./configuration.md)
- [Tools Reference](./tools.md)
- [Deployment](./deployment.md)
