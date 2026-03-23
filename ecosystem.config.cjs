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
        DATABASE_URL: process.env.DATABASE_URL,
        TELEGRAM_API_ID: process.env.TELEGRAM_API_ID,
        TELEGRAM_API_HASH: process.env.TELEGRAM_API_HASH,
        SESSIONS_PATH: process.env.SESSIONS_PATH || '/root/agentr/sessions',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        API_SECRET: process.env.API_SECRET,
        AGENTR_LOG_PRETTY: process.env.AGENTR_LOG_PRETTY || 'false',
        LLM_PROVIDER: process.env.LLM_PROVIDER || 'anthropic',
        NODE_ENV: process.env.NODE_ENV || 'production',
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
