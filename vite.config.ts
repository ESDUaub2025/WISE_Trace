import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({ registerType: 'prompt', includeAssets: ['wise.svg'], manifest: { name: 'WISE · Digital Traceability', short_name: 'WISE', lang: 'en', theme_color: '#344b32', background_color: '#f8f5ed', display: 'standalone', start_url: '/', icons: [{ src: '/wise.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, workbox: { importScripts:['/push-events.js'], globPatterns: ['**/*.{js,css,html,svg,woff2}'], navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/p\//], maximumFileSizeToCacheInBytes: 3500000 } })],
  build: { rollupOptions: { input: { app: resolve(import.meta.dirname, 'index.html'), public: resolve(import.meta.dirname, 'p/index.html') } } },
});
