module.exports = {
  apps: [
    {
      name: 'appk3s-api',
      cwd: '/opt/AppK3s/apps/api',
      script: 'pnpm',
      args: 'dev',
      env: {
        NODE_ENV: 'development',
        PORT: '10112',
        DATABASE_URL: 'postgresql://appk3s:appk3s@localhost:5432/appk3s',
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: 'change-me-in-production-use-32-chars-min',
        KUBECONFIG: '/etc/rancher/k3s/k3s.yaml'
      }
    },
    {
      name: 'appk3s-web',
      cwd: '/opt/AppK3s/apps/web',
      script: 'pnpm',
      args: 'dev --host',
      env: {
        VITE_API_URL: ''
      }
    }
  ]
}
