import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  testMatch: 'file-testing.spec.ts',
  outputDir: 'out/file-test-browser',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4175/wise-trace-test/', serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:file-test && npx vite preview --outDir build/file-test --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175/wise-trace-test/',
    reuseExistingServer: false,
    env: {
      VITE_FILE_BACKEND_URL: 'https://script.google.com/macros/s/wise-test-stub/exec',
      VITE_BASE_PATH: '/wise-trace-test/',
    },
    timeout: 180000,
  },
});
