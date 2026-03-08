import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/monitoring-api': {
        target: process.env.MONITORING_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/monitoring-api/, '')
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
