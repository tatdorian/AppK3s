import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// API port is configured in ecosystem.config.cjs (PORT=10112)
const API_PORT = process.env.API_PORT ?? '10112';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@appk3s/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    strictPort: false, // allow fallback if 3000 is in use
    // Allow requests proxied through Traefik / any reverse proxy
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
