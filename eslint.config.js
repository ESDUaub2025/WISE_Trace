import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
const serverGlobals = Object.fromEntries(
  [
    'process',
    'Buffer',
    'console',
    'Request',
    'Response',
    'fetch',
    'URL',
    'Headers',
    'crypto',
    'TextEncoder',
    'TextDecoder',
    'btoa',
    'atob',
    'setTimeout',
    'AbortSignal',
    'FormData',
  ].map((name) => [name, 'readonly']),
);
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'out/**',
      'test-results/**',
      'playwright-report/**',
      'node_modules/**',
      '.projectgraph/**',
    ],
  },
  js.configs.recommended,
  { files: ['server/**/*.mjs', 'deploy/*.mjs'], languageOptions: { globals: serverGlobals } },
  { files: ['public/*.js'], languageOptions: { globals: { self: 'readonly', URL: 'readonly' } } },
  ...tseslint.configs.recommended,
  {
    files: ['scripts/*.mjs'],
    languageOptions: {
      globals: { crypto: 'readonly', document: 'readonly', getComputedStyle: 'readonly', process: 'readonly' },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
);
