import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '취준노트', short_name: '취준노트', lang: 'ko',
        description: '지원 내역과 면접 일정 관리',
        start_url: '/', scope: '/', display: 'standalone',
        theme_color: '#245bd7', background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        // Personal data is never stored in the service-worker cache.
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }],
      },
    }),
  ],
  server: { host: '127.0.0.1', proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080' } },
  preview: { host: '127.0.0.1', proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080' } },
})
