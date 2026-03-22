module.exports = {
  apps: [
    {
      name: 'agentr-api',
      script: 'node_modules/.bin/tsx',
      args: 'packages/api/src/index.ts',
      cwd: '/root/agentr',
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
      env: {
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
