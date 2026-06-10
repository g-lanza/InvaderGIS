// ESLint flat config (ESLint 9+) for InvaderGIS.
//
// Restores the quality gate: `npm run lint` (and therefore `npm run check`) was
// dead because ESLint 9 dropped legacy .eslintrc and no flat config existed.
//
// Rule intent (project coding conventions):
//   · TypeScript-aware linting via typescript-eslint (non-type-checked preset —
//     fast, and tsc --noEmit already covers full type-checking in `check`).
//   · react-hooks: enforce the rules of hooks + exhaustive-deps (we rely on
//     effect-dep correctness throughout MapCanvas etc.).
//   · react-refresh: keep Fast Refresh working (component/hook export hygiene).
//   · no-console except warn/error — production code must not ship console.log/
//     debug (rules/common/coding-style.md). warn/error are allowed for honest
//     runtime diagnostics (used by the loaders + map layers).
//
// Scope: lints src/ + root config TS. Generated/vendor output is ignored.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  // Never lint build output, deps, baked data blobs, or the vendored marker-kit
  // reference artifact (markers/marker-kit.js — a browser-global IIFE ported into
  // src/design/glyphMarks.tsx; not part of the app build, so app lint rules like
  // no-undef on `window` do not apply to it).
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'data/**', 'scripts/**', 'coverage/**', 'markers/**'],
  },

  // Base JS + TypeScript recommended rules.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Application source (browser runtime, React).
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // No console.log/debug in production; warn/error are allowed (honest diagnostics).
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // typescript-eslint adjustments tuned to this codebase:
      //   · `any` is flagged but as a warning — the MapLibre GL layer files carry
      //     a bounded set of unavoidable `any`s (GL expression types are loose);
      //     a warning keeps them visible without blocking the gate.
      '@typescript-eslint/no-explicit-any': 'warn',
      //   · allow intentionally-unused args prefixed with _ (matches tsconfig's
      //     noUnusedParameters convention for ignored callback params).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Test files: relax a couple of rules that fight test ergonomics.
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Root-level config files run in Node (vite/vitest config, this file).
  {
    files: ['*.{ts,js}', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
