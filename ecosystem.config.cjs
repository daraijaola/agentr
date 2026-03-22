module.exports = {
  apps: [
    {
      name: 'agentr-api',
      script: 'packages/api/dist/index.js',
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
    {
      name: 'agentr-dashboard',
      script: 'packages/dashboard/server.js',
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
}
