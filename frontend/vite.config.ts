import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// В dev режиме Vite работает либо локально на хосте, либо внутри Docker-контейнера.
// Чтобы и там, и там корректно проксировать запросы на backend, берём адрес из env.
// Локально: BACKEND_PROXY_ORIGIN не задан → используем http://localhost:8080.
// В Docker: в docker-compose.yml пробросим BACKEND_PROXY_ORIGIN=http://backend:8080.
const backendOrigin = process.env.BACKEND_PROXY_ORIGIN || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    allowedHosts: [
      '.trycloudflare.com',
      '.ngrok-free.app',
      '.ngrok.io',
    ],
    proxy: {
      // Все /api/* идут в Java; Java сам проксирует /api/forecast в Python с JWT
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
        secure: false,
        // SMTP / request-code может занимать десятки секунд; дефолтный прокси обрывает раньше → socket hang up
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
      '/uploads': {
        target: backendOrigin,
        changeOrigin: true,
        secure: false,
        timeout: 60_000,
        proxyTimeout: 60_000,
      },
    },
  },
})

