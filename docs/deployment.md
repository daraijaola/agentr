# Deployment Guide

This guide is for operators who want to self-host the AGENTR platform. End users do not need this — just sign up at [agentr.online](https://agentr.online).

---

## Requirements

- Ubuntu 24.04 (recommended)
- Node.js 20+ (see `.nvmrc`)
- pnpm — `npm install -g pnpm`
- PostgreSQL
- PM2 — `npm install -g pm2`
- Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)
- At least one LLM API key

---

## 1. Install System Dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib
npm install -g pnpm pm2
```

---

## 2. Database Setup

```bash
sudo -u postgres psql -c "CREATE USER agentr WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE agentr OWNER agentr;"
```

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

Dashboard runs on port `5173`. API runs on port `3001` (or `API_PORT` from `.env`).

---

## Docker

```bash
docker build -t agentr .

docker run -d \
  --name agentr \
  -p 3001:3001 \
  -p 5173:5173 \
  -v $(pwd)/sessions:/app/sessions \
  --env-file .env \
  agentr
```

---

## Nginx (Optional)

To serve on a domain with HTTPS:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:5173/;
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
- [ ] `API_SECRET` changed from the default
- [ ] PostgreSQL running and `DATABASE_URL` correct
- [ ] Telegram API credentials from my.telegram.org/apps
- [ ] At least one LLM API key configured
- [ ] `TON_API_KEY` set for blockchain features
- [ ] PM2 startup saved (`pm2 save && pm2 startup`)

---

## Sessions Directory

Each user's workspace is stored at `/sessions/{tenantId}/`. In production:
- Already excluded from git via `.gitignore`
- Back it up regularly
- Mount as a Docker volume if using containers
