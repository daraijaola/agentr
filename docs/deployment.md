# Deployment Guide

This guide is for operators who want to self-host the AGENTR platform. End users do not need this — just sign up at [agentr.online](https://agentr.online).

---

## Requirements

- Ubuntu 22.04 / 24.04 (recommended)
- Node.js 20+
- pnpm — `npm install -g pnpm`
- PostgreSQL 14+
- PM2 — `npm install -g pm2`
- Docker (optional — enables per-tenant container sandboxing)
- Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)
- At least one LLM API key (AIR recommended)

---

## 1. Install System Dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib
npm install -g pnpm pm2
```

**Optional — Docker for tenant sandboxing:**
```bash
sudo apt install -y docker.io
sudo usermod -aG docker $USER
```

---

## 2. Database Setup

```bash
sudo -u postgres psql -c "CREATE USER agentr WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE agentr OWNER agentr;"
```

Migrations run automatically on first startup — no manual SQL needed.

---

## 3. Clone and Configure

```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
pnpm install
cp .env.example .env
```

Edit `.env` — see [Configuration](./configuration.md) for all variables.

---

## 4. Build

```bash
pnpm build
```

---

## 5. Start

```bash
# API server
pm2 start packages/api/dist/index.js --name agentr-api

# Dashboard
pm2 start "node packages/dashboard/server.js" --name agentr-dashboard

# Persist across reboots
pm2 save && pm2 startup
```

Dashboard runs on port `5000`. API runs on port `3000` (or `API_PORT` from `.env`).

---

## 6. Updating

```bash
git pull origin main
pnpm install
pnpm build
pm2 restart all
pm2 logs --lines 30
```

---

## Docker (full platform)

```bash
docker build -t agentr .

docker run -d \
  --name agentr \
  -p 3000:3000 \
  -p 5000:5000 \
  -v $(pwd)/sessions:/app/sessions \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --env-file .env \
  agentr
```

Mount the Docker socket so the API can spawn per-tenant sandbox containers.

---

## Nginx (Optional)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://localhost:5000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Pre-Launch Checklist

- [ ] `SERVER_PUBLIC_IP` set to your server's public IP
- [ ] `API_SECRET` set — generate with `openssl rand -hex 32`
- [ ] `WALLET_ENCRYPTION_KEY` set — generate with `openssl rand -hex 32` (min 32 chars)
- [ ] `ADMIN_PASSWORD` changed from default
- [ ] PostgreSQL running and `DATABASE_URL` correct
- [ ] Telegram API credentials from my.telegram.org/apps
- [ ] `LLM_PROVIDER` and matching API key configured
- [ ] `AIR_BASE_URL` set if using AIR provider
- [ ] `TON_API_KEY` set for blockchain features
- [ ] PM2 startup saved (`pm2 save && pm2 startup`)
- [ ] (Optional) Docker installed and socket mounted for tenant sandboxing

---

## Sessions Directory

Each user's workspace is stored at `/{WORKSPACES_PATH}/{tenantId}/`. In production:
- Already excluded from git via `.gitignore`
- Back it up regularly — it contains all user code, bots, and memory files
- Mount as a Docker volume if using containers

## Health Checks

The API exposes two health endpoints:

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /health` | None | `{ status: "ok", uptime }` — always 200 |
| `GET /health/ready` | None | DB ping + active agent count — 503 if DB is down |

Use `/health/ready` for load balancer health checks and uptime monitoring.
