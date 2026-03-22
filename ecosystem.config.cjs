module.exports = {
  apps: [
    {
      name: 'agentr-api',
      script: 'node',
      args: '--import tsx packages/api/src/index.ts',
      cwd: '/root/agentr',
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
      env: {
        DATABASE_URL: 'postgresql://agentr:agentr@localhost:5432/agentr',
        TELEGRAM_API_ID: 10213775,
        TELEGRAM_API_HASH: '10177b03e1db0f6d99e2e2f3f8ed9450',
        SESSIONS_PATH: '/root/agentr/sessions',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
        AGENTR_LOG_PRETTY: 'false',
        LLM_PROVIDER: 'anthropic',
        NODE_ENV: 'production',
      },
    },
    {
      name: 'agentr-dashboard',
      script: 'packages/dashboard/server.js',
      cwd: '/root/agentr',
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
}
