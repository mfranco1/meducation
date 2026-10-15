import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditAdmin, adminProxy } from './check-admin-artifacts.mjs';

const valid = ['../../src/admin/main.tsx', '../../src/admin/HttpAdminApp.tsx', '../../src/admin/SessionCompletion.tsx'];
for (const fault of [
  undefined,
  'local-editor',
  'memory-gateway',
  'test-helper',
  'bank',
  'qa',
  'missing-http',
  'missing-completion',
  'missing-entry',
]) {
  test(`optional admin audit ${fault ?? 'accepts HTTP-only artifacts'}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'meducation-admin-audit-'));
    try {
      mkdirSync(join(root, '.vite'));
      writeFileSync(join(root, 'admin.html'), '<html></html>');
      const sources =
        fault === 'missing-http'
          ? valid.filter((s) => !s.includes('HttpAdminApp'))
          : fault === 'missing-completion'
            ? valid.filter((s) => !s.includes('SessionCompletion'))
            : [...valid];
      if (fault === 'local-editor') sources.push('../../src/admin/LocalAdminApp.tsx');
      if (fault === 'memory-gateway') sources.push('../../src/admin/data/InMemoryQuestionBankGateway.ts');
      if (fault === 'test-helper') sources.push('../../src/test/InMemoryQuestionBankGateway.ts');
      if (fault === 'bank') sources.push('../../src/content/questionBank.generated.json');
      if (fault === 'qa') sources.push('../../src/qa/ContentQa.tsx');
      writeFileSync(join(root, 'entry.js.map'), JSON.stringify({ sources }));
      writeFileSync(
        join(root, '.vite/manifest.json'),
        JSON.stringify(fault === 'missing-entry' ? {} : { 'admin.html': { isEntry: true } }),
      );
      if (fault) assert.throws(() => auditAdmin(root));
      else assert.equal(auditAdmin(root).files[0].path, 'admin.html');
    } finally {
      rmSync(root, { recursive: true });
    }
  });
}
test('optional admin routing changes only the explicit entry and preserves private proxy/cache limits', () => {
  const source = readFileSync('ops/containers/nginx.conf', 'utf8');
  const result = adminProxy(source);
  assert.match(
    result,
    /location = \/admin.html \{\s+try_files \$uri =404;\s+add_header Cache-Control "no-store" always;/,
  );
  assert.match(result, /client_max_body_size 64m/);
  assert.match(result, /location \^~ \/api\/admin\//);
  assert.match(source, /location = \/admin.html \{\s+return 404;/);
  assert.throws(() => adminProxy(result));
  assert.throws(() => adminProxy(source + source));
});
