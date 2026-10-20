import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function auditAdmin(root) {
  const walk = (path) =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const file = join(path, entry.name);
      return entry.isDirectory() ? walk(file) : [file];
    });
  const files = walk(root).sort();
  const maps = files.filter((file) => file.endsWith('.js.map'));
  if (!maps.length) throw new Error('Hidden JS source maps are required for the admin audit.');
  const sources = [...new Set(maps.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')).sources))];
  const forbidden = sources.filter((source) =>
    /(?:^|\/)src\/(?:test\/|content\/(?:questionBank|flashcardBank)\.generated\.json$)/.test(source),
  );
  if (forbidden.length) throw new Error(`Unexpected admin modules: ${forbidden.join(', ')}`);
  for (const required of ['/src/admin/main.tsx', '/src/admin/HttpAdminApp.tsx', '/src/admin/SessionCompletion.tsx']) {
    if (!sources.some((source) => source.endsWith(required))) throw new Error(`Missing admin module: ${required}`);
  }
  const manifest = JSON.parse(readFileSync(join(root, '.vite/manifest.json'), 'utf8'));
  if (!manifest['admin.html']?.isEntry || !files.some((file) => relative(root, file) === 'admin.html'))
    throw new Error('Missing admin entry.');
  return {
    moduleCount: sources.length,
    fixtureAuthoringModules: [],
    canonicalBankModules: [],
    entries: Object.keys(manifest).sort(),
    files: files
      .filter((file) => !file.endsWith('.map') && !relative(root, file).startsWith('.vite/'))
      .map((file) => {
        const bytes = readFileSync(file);
        return {
          path: relative(root, file),
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        };
      }),
  };
}

export function adminProxy(source) {
  const denied = 'location = /admin.html {\n            return 404;\n        }';
  if (source.split(denied).length !== 2) throw new Error('Expected exactly one default learner admin denial.');
  return source.replace(
    denied,
    'location = /admin.html {\n            try_files $uri =404;\n            include /etc/nginx/meducation-security-headers.conf;\n            add_header Cache-Control "no-store" always;\n        }',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(process.argv[2] ?? 'dist');
  const report = auditAdmin(root);
  const configuration = adminProxy(readFileSync(process.argv[3], 'utf8'));
  writeFileSync(process.argv[4], configuration);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
