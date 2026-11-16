import { execFileSync } from 'node:child_process';
import process from 'node:process';
const options = {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEMO_MODE: 'false',
    VITE_API_URL: '/api',
    VITE_FILE_BACKEND_URL: '',
    VITE_BASE_PATH: '/',
  },
};
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], options);
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'build/production'], options);
