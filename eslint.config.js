import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config({ ignores: ['dist/**', 'build/**', 'out/**', 'test-results/**', 'playwright-report/**', 'node_modules/**', 'supabase/functions/**', '.projectgraph/**'] }, js.configs.recommended, {files:['public/*.js'],languageOptions:{globals:{self:'readonly',URL:'readonly'}}}, ...tseslint.configs.recommended, { files: ['scripts/*.mjs'], languageOptions: {globals:{crypto:'readonly',document:'readonly',getComputedStyle:'readonly'}} }, { files: ['**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } });
