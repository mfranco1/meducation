import { parseAuthoringJson } from '../../src/content/validation/parseAuthoringJson';
import limits from '../../src/content/validation/authoringLimits.json';
import { validateAuthoringPair } from '../../src/content/validation/pairedAuthoringValidation';

// Only Python's strictly parsed, bounded pair reaches this packaged stdin worker.
// No database, networking, filesystem paths from requests, or canonical imports.
try {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > limits.requestBytes) throw new Error('body_limit');
    chunks.push(chunk);
  }
  const result = validateAuthoringPair(parseAuthoringJson(Buffer.concat(chunks).toString('utf8')));
  process.stdout.write(JSON.stringify(result));
} catch {
  process.stdout.write(
    JSON.stringify({
      policyVersion: 1,
      totalIssues: 1,
      truncated: false,
      issues: [{ path: '$.pair', code: 'policy_failed', message: 'Content policy validation failed.' }],
    }),
  );
  process.exitCode = 1;
}
