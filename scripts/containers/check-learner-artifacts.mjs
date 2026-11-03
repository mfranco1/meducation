import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = join(path, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk(root).sort();
const maps = files.filter((file) => file.endsWith('.js.map'));
if (!maps.length) throw new Error('Hidden JS source maps are required for the module audit.');
const sources = [...new Set(maps.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')).sources))];
const forbidden = sources.filter(
  (source) =>
    /(?:^|\/)src\/(?:admin|qa)\//.test(source) ||
    /(?:^|\/)src\/content\/(?:questionBank|flashcardBank)\.generated\.json$/.test(source),
);
if (forbidden.length) throw new Error(`Unexpected learner modules: ${forbidden.join(', ')}`);
const manifest = JSON.parse(readFileSync(join(root, '.vite/manifest.json'), 'utf8'));
if ('admin.html' in manifest || files.some((file) => relative(root, file) === 'admin.html'))
  throw new Error('Learner build contains the admin entry.');
if (!sources.some((source) => source.endsWith('/src/main.tsx'))) throw new Error('Missing learner bootstrap module.');
