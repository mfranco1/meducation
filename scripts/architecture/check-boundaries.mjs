import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResolver, findCycles, importProblem, isTest, moduleImports, reachableFrom } from './boundaries.mjs';

export function checkRepository(root) {
  const files = [];
  const walk = (directory) => {
    if (!fs.existsSync(path.join(root, directory))) return;
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (/\.[cm]?[jt]sx?$/.test(file)) files.push(file);
    }
  };
  walk('src');
  walk('scripts');
  const resolve = createResolver(root);
  const runtime = new Map();
  const eager = new Map();
  const problems = [];
  let imports = 0;
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const runtimeTargets = [];
    const eagerTargets = [];
    for (const reference of moduleImports(text, file)) {
      imports++;
      const resolved =
        reference.specifier === undefined
          ? { problem: 'Use literal module paths so dependency boundaries can be checked.' }
          : resolve(file, reference.specifier);
      const problem = resolved.problem ?? importProblem(file, resolved.target, reference.typeOnly);
      if (problem) problems.push(`${file}:${reference.line}: ${problem}`);
      if (resolved.target?.startsWith('src/') || resolved.target?.startsWith('scripts/')) {
        if (!isTest(file) && !reference.typeOnly) {
          runtimeTargets.push(resolved.target);
          if (!reference.dynamic) eagerTargets.push(resolved.target);
        }
      }
    }
    if (!isTest(file)) {
      runtime.set(file, runtimeTargets);
      eager.set(file, eagerTargets);
    }
  }
  for (const cycle of findCycles(runtime)) problems.push(`Runtime dependency cycle: ${cycle.join(' -> ')}`);
  // App is also a root because main deliberately loads it through a dynamic import.
  for (const file of reachableFrom(eager, ['src/main.tsx', 'src/app/App.tsx'])) {
    if (/^src\/content\/.*\.generated\.json$/.test(file) || file.startsWith('src/content/validation/'))
      problems.push(`Learner startup eagerly imports authoring/complete-bank content: ${file}`);
  }
  return { files: files.length, imports, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkRepository(fileURLToPath(new URL('../../', import.meta.url)));
  if (result.problems.length) {
    result.problems.forEach((problem) => console.error(problem));
    process.exitCode = 1;
  } else
    console.log(
      `Architecture valid: ${result.files} modules, ${result.imports} imports; no forbidden dependencies, runtime cycles, or eager learner banks/validators.`,
    );
}
