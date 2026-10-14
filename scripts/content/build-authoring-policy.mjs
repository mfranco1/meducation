import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const output = 'backend/src/meducation_api/content_policy';
await mkdir(output, { recursive: true });
await build({
  entryPoints: ['scripts/content/authoring-policy-worker.ts'],
  outfile: `${output}/worker.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  define: { 'import.meta.env': 'undefined' },
});
await copyFile('src/content/validation/authoringLimits.json', `${output}/limits.json`);
