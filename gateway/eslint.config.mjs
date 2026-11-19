// ESLint flat config for the gateway (Node.js / TypeScript, CommonJS).
// Rules are deliberately light: the codebase decodes protobuf messages whose
// shapes are only known at runtime, so `any` is allowed and console output is
// the gateway's logging mechanism.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'src/proto/**']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'commonjs',
      },
    },
    rules: {
      // Protobuf messages are decoded dynamically; `any` is intentional.
      '@typescript-eslint/no-explicit-any': 'off',
      // Unused args are often required to match an interface/handler signature.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
]);
