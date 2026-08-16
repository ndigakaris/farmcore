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

      // Off, deliberately. This rule exists to make Vite's hot reload
      // slightly faster in dev; it flags the ordinary React idiom of
      // exporting a Provider and its `use…` hook from the same context
      // file. Splitting those apart across the codebase would buy nothing
      // at runtime, so the rule is noise here rather than a signal.
      'react-refresh/only-export-components': 'off',

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

      // React Compiler diagnostics, off deliberately. They describe why
      // the compiler would decline to optimise a component — but this
      // project does not run the React Compiler, so they report on an
      // optimisation that never happens. The remaining hits are all the
      // ordinary "load once on mount" effect, which React itself
      // documents as correct.
      //
      // Turn these back on as warnings the day the compiler is adopted;
      // they become genuinely useful then.
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',

      // These two stay ON — they catch real bugs (stale closures over
      // props, hooks called conditionally), not compiler preferences.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
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
