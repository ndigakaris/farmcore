import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    // Dexie needs a DOM + IndexedDB; the suite pulls in fake-indexeddb.
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
  build: {
    // The app shipped as one 1.1 MB bundle. Splitting the heavy, rarely
    // first-viewed vendor code keeps the initial download small, which
    // matters a great deal on a rural 2G connection.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) accepts only the function form.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('dexie')) return 'db';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react';
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'FarmCore FMIS',
        short_name: 'FarmCore',
        description: 'Your Entire Farm. One System.',
        theme_color: '#2D5016',
        background_color: '#F5F0E8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [{
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: 'CacheFirst',
          options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60*60*24*365 } }
        }]
      }
    })
  ],
})
