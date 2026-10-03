import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default ts.config(
  {
    ignores: [
      'dist/**',
      'src-tauri/target/**',
      'node_modules/**',
      'admin/cloudflare/public/**',
      'admin/cloudflare/schema.mjs',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': hooks },
    rules: { ...hooks.configs.recommended.rules },
  },
  { files: ['*.js'], languageOptions: { globals: globals.node } },
  { files: ['admin/*.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['admin/cloudflare/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  { files: ['admin/dashboard.js'], languageOptions: { globals: globals.browser } },
);
