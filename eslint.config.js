// eslint.config.js — ESLint v9 flat config.
//
// The repo declared a `lint` script and the eslint dependencies, but no
// config file ever existed, so `npm run lint` had always exited with
// "couldn't find an eslint.config file". Nothing was being checked.

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**'] },

  // ── Browser app code ────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Warn, not error: the pre-existing feature modules carry a number
      // of dead locals. They are worth seeing but must not block a
      // deploy, and clearing them touches files for no functional gain.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^[A-Z_]',
        caughtErrors: 'none',
      }],

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['warn', 'smart'],

      // React Compiler diagnostics. This codebase does not run the
      // compiler, so these are advisory — useful to see, but they must
      // not fail the build over pre-existing component structure.
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },

  // ── Serverless functions (Node) ─────────────────────────────
  {
    files: ['api/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
