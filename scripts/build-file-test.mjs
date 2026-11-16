import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const config = JSON.parse(readFileSync(new URL('../deploy/google-file-backend/config.json', import.meta.url), 'utf8'));
const url = process.env.VITE_FILE_BACKEND_URL || config.url;
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url))
  throw new Error('Use the Apps Script deployment URL ending in /exec.');
const base = process.env.VITE_BASE_PATH || config.basePath;
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Base path must start and end with /.');
const options = {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEMO_MODE: 'false', VITE_FILE_BACKEND_URL: url, VITE_BASE_PATH: base },
};
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], options);
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'build/file-test'], options);
writeFileSync('build/file-test/.nojekyll', '');
writeFileSync(
  'build/file-test/release.json',
  JSON.stringify({ release: 'worker-interface-2026-11-15', builtAt: new Date().toISOString() }, null, 2) + '\n',
);
copyFileSync('deploy/google-file-backend/Code.gs', 'build/file-test/Code.gs');
writeFileSync(
  'build/file-test/README.md',
  '# WISE shared testing build\n\nTemporary open testing: choose a username to create or reopen an account. No passwords or keys.\nUse fictional data only. Records are shared through a Google Drive JSON file.\n',
);
