import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/live',
  outputDir: 'out/live-tests',
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', serviceWorkers: 'allow', ...devices['Pixel 7'] },
  webServer: {
    command: 'npx vite build --outDir build/live && npx vite preview --host 127.0.0.1 --port 5173 --outDir build/live',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    env: { VITE_DEMO_MODE: 'false' },
    timeout: 120000,
  },
});
