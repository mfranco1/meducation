import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Module boundaries (see docs/architecture.md). Patterns match import specifiers; each block
// replaces the previous rule value, so every block lists everything that applies to its files.
const testFiles = ['src/test/**', '**/*.{test,spec}.{ts,tsx}'];
const under = (...names) => names.flatMap((name) => [`**/${name}`, `**/${name}/**`]);
const restrict = (message, group, allowTypeImports = false) => ({ group, message, allowTypeImports });
const uiLibraries = restrict('This layer cannot depend on React or UI libraries.', [
  'react',
  'react/*',
  'react-dom',
  'react-dom/*',
  '@mui/**',
  '@emotion/**',
]);
const noTestCode = restrict('Production code cannot import tests, fixtures, e2e or scripts.', [
  ...under('test', 'tests', 'e2e', 'scripts'),
  '**/*.test',
  '**/*.spec',
]);
const feature = (name, sibling) => {
  const forbid = restrict('Features cannot import app, admin or sibling features.', under('app', 'admin', sibling));
  const concretePersistence = restrict(
    'Only session modules use concrete persistence; elsewhere import types only.',
    under('persistence'),
    true,
  );
  return [
    { dir: `features/${name}`, patterns: [forbid, concretePersistence] },
    { dir: `features/${name}/session`, patterns: [forbid] },
  ];
};
const layer = (message, ...names) => restrict(message, under(...names));
// Files directly under src/admin (and their subfolders other than core and data) are presentation.
const adminPure = [
  layer('Admin core and data cannot import presentation.', 'app', 'features', 'shared', 'components'),
  {
    regex: String.raw`^\.\./(?!core(/|$)|data(/|$)|\.\.)`,
    message: 'Admin core and data cannot import admin presentation.',
  },
];
const layers = [
  {
    dir: 'domain',
    ui: true,
    patterns: [
      layer(
        'Domain depends only on domain.',
        'analytics',
        'persistence',
        'content',
        'shared',
        'features',
        'app',
        'admin',
      ),
    ],
  },
  {
    dir: 'analytics',
    ui: true,
    patterns: [
      layer('Analytics depends only on domain.', 'persistence', 'content', 'shared', 'features', 'app', 'admin'),
    ],
  },
  {
    dir: 'persistence',
    ui: true,
    patterns: [
      layer('Persistence depends only on domain.', 'analytics', 'content', 'shared', 'features', 'app', 'admin'),
    ],
  },
  {
    dir: 'content',
    ui: true,
    patterns: [
      layer('Content depends only on domain.', 'analytics', 'persistence', 'shared', 'features', 'app', 'admin'),
    ],
  },
  {
    dir: 'shared',
    patterns: [
      layer('Shared UI cannot import app, features, admin or persistence.', 'persistence', 'features', 'app', 'admin'),
    ],
  },
  ...feature('quizzes', 'flashcards'),
  ...feature('flashcards', 'quizzes'),
  { dir: 'admin/core', ui: true, patterns: adminPure },
  { dir: 'admin/data', ui: true, patterns: adminPure },
];
const restrictImports = (patterns) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
});
const boundaryRules = [
  { files: ['src/**/*.{ts,tsx}'], ignores: testFiles, rules: restrictImports([noTestCode]) },
  ...layers.flatMap(({ dir, ui, patterns }) => {
    const base = ui ? [uiLibraries] : [];
    return [
      {
        files: [`src/${dir}/**/*.{ts,tsx}`],
        ignores: testFiles,
        rules: restrictImports([...base, noTestCode, ...patterns]),
      },
      { files: [`src/${dir}/**/*.{test,spec}.{ts,tsx}`], rules: restrictImports(base) },
    ];
  }),
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'e2e/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...boundaryRules,
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
