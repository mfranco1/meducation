import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import architecture from './scripts/architecture/eslint-plugin.mjs';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src/content/questionBank.generated.json', 'e2e/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { architecture },
    rules: { 'architecture/boundaries': 'error' },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/persistence/**', 'src/test/**', '**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'localStorage', 'sessionStorage'],
      'no-restricted-properties': [
        'error',
        ...['localStorage', 'sessionStorage'].map((property) => ({
          property,
          message: 'Use a persistence repository.',
        })),
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['scripts/**/*.{ts,mjs}', '*.config.{ts,mjs}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  eslintConfigPrettier,
);
