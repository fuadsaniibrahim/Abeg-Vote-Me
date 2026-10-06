import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: false },
      '/socket.io': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000', ws: true, changeOrigin: false },
    },
  },
  build: { target: 'es2020', sourcemap: false },
});
