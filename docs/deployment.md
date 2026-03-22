# Deployment

## Production Setup (Ubuntu 24.04)

### 1. Install Dependencies
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib
npm install -g pnpm pm2
```

### 2. Database
```bash
sudo -u postgres psql -c "CREATE USER agentr WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE agentr OWNER agentr;"
```

### 3. Clone and Build
```bash
git clone https://github.com/daraijaola/agentr.git
cd agentr
pnpm install
cp .env.example .env
# Edit .env
pnpm build
```

### 4. Start with PM2
```bash
pm2 start packages/api/dist/index.js --name agentr-api
pm2 start "node packages/dashboard/server.js" --name agentr-dashboard
pm2 save && pm2 startup
```

## Docker
```bash
docker build -t agentr .
docker run -d \
  --name agentr \
  -p 3001:3001 -p 5173:5173 \
  -v $(pwd)/sessions:/app/sessions \
  --env-file .env \
  agentr
```

## Environment Checklist

- [ ] `SERVER_PUBLIC_IP` set to your public IP
- [ ] `API_SECRET` set to a strong random string
- [ ] PostgreSQL running and `DATABASE_URL` correct
- [ ] Telegram API credentials from my.telegram.org/apps
- [ ] At least one LLM API key configured
- [ ] PM2 startup configured
