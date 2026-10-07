import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { checkRepository } from './check-boundaries.mjs';
import { moduleImports } from './boundaries.mjs';

const eslint = new ESLint();
const lint = async (text, filePath) => (await eslint.lintText(text, { filePath }))[0].messages;
const boundaryErrors = (messages) => messages.filter((message) => message.ruleId === 'architecture/boundaries');

test('ESLint rejects shared/content/admin presentation edges and concrete storage in feature screens', async () => {
  for (const [file, dependency, message] of [
    ['src/shared/probe.ts', '../app/App', 'Shared presentation'],
    ['src/content/api/probe.ts', '../../shared/theme', 'Content cannot'],
    ['src/admin/core/probe.ts', '../AdminApp', 'Admin core/data'],
    ['src/admin/data/probe.ts', '../FlashcardAdminPanel', 'Admin core/data'],
    ['src/features/quizzes/screens/probe.ts', '../../../persistence/localRepository', 'Only feature sessions'],
    ['src/analytics/probe.ts', '../persistence/localRepository', 'Analytics can depend'],
  ]) {
    const errors = boundaryErrors(await lint(`export * from '${dependency}';`, file));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes(message), `${file}: ${errors[0].message}`);
  }
});

test('ESLint rejects forbidden static, type, export, import-query, and dynamic edges after normalization', async () => {
  for (const text of [
    "import { App } from '../app/../app/App';",
    "import type { View } from '../app/navigation';",
    "export { App } from '../app/App';",
    "export type { View } from '../app/navigation';",
    "type View = import('../app/navigation').View;",
    "export const load = () => import('../app/App');",
    "export const load = () => require('../app/App');",
  ])
    assert.equal(boundaryErrors(await lint(text, 'src/domain/probe.ts')).length, 1, text);
});

test('ESLint rejects sibling features and React/MUI dependencies in pure layers', async () => {
  assert.equal(
    boundaryErrors(
      await lint("export * from '../flashcards/screens/FlashcardStudyScreen';", 'src/features/quizzes/probe.ts'),
    ).length,
    1,
  );
  for (const file of [
    'src/domain/probe.ts',
    'src/analytics/probe.ts',
    'src/content/validation/probe.ts',
    'src/admin/core/probe.ts',
  ]) {
    for (const dependency of ['react', 'react/jsx-runtime', '@mui/material', '@emotion/react'])
      assert.equal(boundaryErrors(await lint(`import '${dependency}';`, file)).length, 1, `${file}: ${dependency}`);
  }
});

test('ESLint preserves composition and shared rendering without letting tests bypass ownership', async () => {
  assert.equal(
    boundaryErrors(
      await lint("export { QuizScreen } from '../features/quizzes/screens/QuizScreen';", 'src/app/probe.ts'),
    ).length,
    0,
  );
  assert.equal(
    boundaryErrors(
      await lint("export * from '../../../content/richText/richContentPolicy';", 'src/shared/ui/content/probe.ts'),
    ).length,
    0,
  );
  assert.equal(boundaryErrors(await lint("export { App } from '../app/App';", 'src/domain/probe.test.ts')).length, 1);
  assert.equal(
    boundaryErrors(
      await lint("export * from '../../admin/core/serializeBank';", 'src/content/validation/bankContract.test.ts'),
    ).length,
    0,
  );
  assert.equal(
    boundaryErrors(
      await lint("export * from '../../admin/core/serializeBank';", 'src/content/validation/probe.test.ts'),
    ).length,
    1,
  );
});

test('ESLint restricts browser storage to persistence, with test and shadowed-variable support', async () => {
  for (const text of [
    "localStorage.getItem('key');",
    "sessionStorage.setItem('key', 'value');",
    "window.localStorage.getItem('key');",
    "globalThis['sessionStorage'].clear();",
    'const browser = window; browser.localStorage.clear();',
    'const { localStorage: store } = window; store.clear();',
  ]) {
    const errors = await lint(text, 'src/app/probe.ts');
    assert.ok(
      errors.some((message) => message.ruleId?.startsWith('no-restricted-')),
      text,
    );
    assert.ok(
      !(await lint(text, 'src/persistence/probe.ts')).some((message) => message.ruleId?.startsWith('no-restricted-')),
    );
    assert.ok(
      !(await lint(text, 'src/app/probe.test.ts')).some((message) => message.ruleId?.startsWith('no-restricted-')),
    );
  }
  const shadowed = 'export function clear(localStorage: { clear(): void }) { localStorage.clear(); }';
  assert.ok(!(await lint(shadowed, 'src/app/probe.ts')).some((message) => message.ruleId === 'no-restricted-globals'));
});

test('computed module paths are rejected instead of silently escaping the graph', async () => {
  assert.equal(
    boundaryErrors(await lint('export const load = (path: string) => import(path);', 'src/app/probe.ts')).length,
    1,
  );
});

function fixture(files, action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meducation-architecture-'));
  const config = {
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      paths: { '@app/*': ['./src/app/*'] },
    },
  };
  try {
    for (const [file, text] of Object.entries({
      'tsconfig.app.json': JSON.stringify(config),
      'tsconfig.node.json': JSON.stringify(config),
      ...files,
    })) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), text);
    }
    action(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('graph resolves configured aliases and rejects unresolved relative imports', () => {
  fixture(
    {
      'src/app/App.tsx': 'export const App = 1;',
      'src/domain/types.ts': "export const load = () => import('@app/App');\nexport * from './missing';",
    },
    (root) => {
      const problems = checkRepository(root).problems;
      assert.ok(problems.some((problem) => problem.includes('Domain code')));
      assert.ok(problems.some((problem) => problem.includes('Cannot resolve')));
    },
  );
});

test('graph detects transitive runtime cycles including lazy edges, while permitting type-only cycles', () => {
  fixture(
    {
      'src/domain/a.ts': "export const load = () => import('./b');",
      'src/domain/b.ts': "export * from './c';",
      'src/domain/c.ts': "export * from './a';",
    },
    (root) => assert.ok(checkRepository(root).problems.some((problem) => problem.includes('Runtime dependency cycle'))),
  );
  fixture(
    {
      'src/domain/a.ts': "import type { B } from './b'; export type A = B;",
      'src/domain/b.ts': "import { type A } from './a'; export type B = A;",
    },
    (root) => assert.deepEqual(checkRepository(root).problems, []),
  );
});

test('learner startup cannot eagerly reach banks or validators through intermediate modules', () => {
  fixture(
    {
      'src/app/App.tsx': "import '../content/api/bridge';",
      'src/content/api/bridge.ts': "import '../local/bank';",
      'src/content/local/bank.ts': "import '../questionBank.generated.json'; import '../validation/validate';",
      'src/content/questionBank.generated.json': '{}',
      'src/content/validation/validate.ts': 'export const valid = true;',
    },
    (root) => {
      const problems = checkRepository(root).problems;
      assert.equal(problems.filter((problem) => problem.includes('Learner startup eagerly')).length, 2);
    },
  );
  fixture(
    {
      'src/app/App.tsx': "import '../content/api/bridge';",
      'src/content/api/bridge.ts': "export const load = () => import('../local/bank');",
      'src/content/local/bank.ts': "import '../questionBank.generated.json';",
      'src/content/questionBank.generated.json': '{}',
    },
    (root) => assert.deepEqual(checkRepository(root).problems, []),
  );
});

test('mixed imports keep runtime edges; erased import/export/query edges stay type-only', () => {
  const imports = moduleImports(
    "import { type A, b } from './b'; import { type A } from './a'; export type { A } from './a'; type A = import('./a').A;",
    'src/domain/a.ts',
  );
  assert.deepEqual(
    imports.map((reference) => reference.typeOnly),
    [false, true, true, true],
  );
});
