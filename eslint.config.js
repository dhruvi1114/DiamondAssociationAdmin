import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-plugin-prettier';

export default [
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'prettier/prettier': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error'] }],
      // Colour literals belong in src/theme/tokens.ts and nowhere else
      // (design-system.md §5). This catches the common cases in review.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/]",
          message: 'Raw hex colours are not allowed outside src/theme/tokens.ts — use a token.',
        },
      ],
    },
  },
  {
    // The token file is the one place a colour literal may appear.
    files: ['src/theme/tokens.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // These files deliberately co-locate a component with the constants or
    // helpers that belong to it (the toast host with `toast`, the nav data with
    // its icons). react-refresh only warns about HMR granularity here, and
    // splitting them would scatter one concept across two files.
    files: ['src/components/ui/Toast.tsx', 'src/constant/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
];
