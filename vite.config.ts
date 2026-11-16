import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

/**
 * Development only. A browser that once opened a built version of the app on this address keeps that
 * version's service worker, which goes on serving the OLD app from its cache even though the dev server
 * is running (symptom: sign-in errors from screens that no longer exist in the code).
 * The dev server therefore answers /sw.js with a worker that deletes those caches, unregisters itself
 * and reloads the page, so the next visit always shows the current code.
 */
const retireStaleServiceWorker = (): Plugin => ({
  name: 'wise-retire-stale-service-worker',
  apply: 'serve',
  configureServer(server) {
    const worker = `
      self.addEventListener('install', () => self.skipWaiting());
      self.addEventListener('activate', (event) => event.waitUntil((async () => {
        for (const key of await caches.keys()) await caches.delete(key);
        await self.registration.unregister();
        for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
      })()));`;
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/sw.js') return next();
      response.setHeader('Content-Type', 'text/javascript');
      response.setHeader('Cache-Control', 'no-store');
      response.end(worker);
    });
  },
});

const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  server: { proxy: { '/api': 'http://127.0.0.1:3007' } },
  plugins: [
    react(),
    tailwindcss(),
    retireStaleServiceWorker(),
    VitePWA({
      // A new version takes over as soon as it is downloaded. The previous setting ('prompt') waited for
      // a confirmation the app never showed, so installed phones stayed on old code after every release.
      // The page itself reloads at a safe moment: see src/app/app-update.ts.
      registerType: 'autoUpdate',
      includeAssets: ['wise.svg'],
      manifest: {
        name: 'WISE · Digital Traceability',
        short_name: 'WISE',
        lang: 'en',
        theme_color: '#344b32',
        background_color: '#f8f5ed',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: `${base}wise.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        importScripts: [`${base}push-events.js`],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/(?:p)\//],
        maximumFileSizeToCacheInBytes: 3500000,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        public: resolve(import.meta.dirname, 'p/index.html'),
      },
    },
  },
});
