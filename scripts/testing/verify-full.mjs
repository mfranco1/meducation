import { spawnSync } from 'node:child_process';

const steps = [
  ['npm', ['run', 'lint']],
  ['npm', ['run', 'format:check']],
  ['npm', ['run', 'test:architecture']],
  ['npm', ['test']],
  ['npm', ['run', 'validate:content']],
  ['.venv/bin/ruff', ['check', 'backend/src', 'backend/tests']],
  ['.venv/bin/mypy', ['backend/src']],
  ['.venv/bin/python', ['-m', 'pytest', 'backend/tests', '-q']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build:learner:smoke']],
  ['npm', ['run', 'test:e2e:prepared']],
  ['npm', ['run', 'build:admin']],
  ['npm', ['run', 'test:e2e:admin']],
];

for (const [program, args] of steps) {
  console.log(`\n$ ${program} ${args.join(' ')}`);
  const result = spawnSync(program, args, { stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}

if (!process.exitCode) console.log('\nFull verification passed.');
