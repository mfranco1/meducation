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
    patterns: [layer('Domain depends only on domain.', 'persistence', 'content', 'shared', 'features', 'app', 'admin')],
  },
  {
    dir: 'persistence',
    ui: true,
    patterns: [layer('Persistence depends only on domain.', 'content', 'shared', 'features', 'app', 'admin')],
  },
  {
    dir: 'content',
    ui: true,
    patterns: [layer('Content depends only on domain.', 'persistence', 'shared', 'features', 'app', 'admin')],
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

// Shape, depth, type and color come from tokens in src/shared/theme.ts (see docs/design-system.md).
// Artwork (logo, subject and topic glyphs, drawn illustrations) keeps its own colors and lettering.
const artworkFiles = [
  'src/shared/ui/brand/**',
  'src/shared/ui/catalog/icons/**',
  'src/shared/ui/catalog/StudyCardIllustration.tsx',
];
const shapeRules = [
  {
    selector: 'Property[key.name=/Radius$/] Literal:not([value=0]):not([value="inherit"]):not([value="50%"])',
    message: 'Use a `radius` token from src/shared/theme.ts.',
  },
  {
    selector:
      'Property[key.name="boxShadow"] :matches(Literal[value=/#|rgba?\\(/], TemplateElement[value.raw=/#|rgba?\\(/])',
    message: 'Use a `shadow` token from src/shared/theme.ts, or build effect shadows from palette colors.',
  },
  {
    selector: 'Property[key.name=/^(border|outline)/] Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/]',
    message: 'Use a palette token (divider, feedback.choiceBorder, primary.*) for borders and outlines.',
  },
  {
    selector: 'Property[key.name="outlineOffset"] Literal',
    message: 'Spread `focusRing` or `focusRingInset` from src/shared/theme.ts.',
  },
];
const typeRules = [
  {
    selector: 'Property[key.name="fontWeight"] Literal',
    message: 'Use a Typography variant, or `fontWeight` from src/shared/theme.ts.',
  },
  {
    selector: 'Property[key.name="fontSize"] Literal[value=/(rem|px)$/]',
    message: 'Use a Typography variant. Numeric font sizes are for icons only.',
  },
  {
    selector: 'Property[key.name=/^(letterSpacing|fontFamily)$/] Literal',
    message: 'Use a Typography variant.',
  },
];
const colorRules = [
  {
    selector:
      'Property[key.name=/^(color|bgcolor|backgroundColor|background|backgroundImage|fill|stroke)$/] :matches(Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/], TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/])',
    message: 'Use a palette token, or `alpha()` of one, from src/shared/theme.ts.',
  },
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'marketing/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
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
    ignores: ['src/shared/theme.ts', ...testFiles, ...artworkFiles],
    rules: { 'no-restricted-syntax': ['error', ...shapeRules, ...typeRules, ...colorRules] },
  },
  {
    files: artworkFiles,
    ignores: testFiles,
    rules: { 'no-restricted-syntax': ['error', ...shapeRules] },
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
    files: ['scripts/**/*.{ts,mjs}', 'e2e/**/*.ts', '*.config.{ts,mjs}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  eslintConfigPrettier,
);
