// Synthetic sizing/invariant audit for L0 Step 5; not the application importer.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';

const MiB = 1024 * 1024;
const limits = {
  backupBytes: 4 * MiB,
  depth: 16,
  nodes: 250000,
  idBytes: 128,
  referenceBytes: 256,
  quizSignatureBytes: 512 * 1024,
  retainedAttempts: 200,
  activeQuizzes: 64,
  responsesPerAttempt: 1000,
  summaryEntries: 2048,
  completedIds: 50000,
  checkpoints: 128,
  cardIdsPerList: 10000,
  originalPairBytes: 4 * MiB,
  targetPairBytes: 4.25 * MiB,
  journalBytes: 20 * MiB,
  rawRecoveryBytes: 64 * MiB,
};
const bytes = (value) => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
const timestamp = '2026-10-13T00:00:00.000Z';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const response = (n) => ({ questionId: `i${n}`, selectedChoiceId: 'A', flagged: false, locked: true, timeMs: 0 });
const attempt = (n, responseCount) => ({
  id: uuid(n),
  quizId: 'q1',
  subjectId: 's1',
  feedbackMode: 'exam',
  startedAt: timestamp,
  elapsedMs: 1000,
  celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
  responses: Object.fromEntries(Array.from({ length: responseCount }, (_, i) => [`i${i}`, response(i)])),
  completedAt: timestamp,
  score: {
    correct: responseCount,
    incorrect: 0,
    unanswered: 0,
    total: responseCount,
    percentage: responseCount ? 100 : 0,
    elapsedMs: 1000,
  },
});
const bankSignature = (questions, stemLength) =>
  JSON.stringify(
    Array.from({ length: questions }, (_, i) => [
      `i${i}`,
      'S'.repeat(stemLength),
      [
        ['A', 'First answer'],
        ['B', 'Second answer'],
      ],
      'A',
      'A',
    ]),
  );
const envelope = (retained = 0, answers = 0, completed = retained, signature) => ({
  format: 'meducation-progress-backup',
  version: 1,
  exportedAt: timestamp,
  quiz: {
    schemaVersion: 2,
    active: signature
      ? {
          q2: {
            id: uuid(completed + 1),
            quizId: 'q2',
            subjectId: 's1',
            feedbackMode: 'exam',
            startedAt: timestamp,
            elapsedMs: 0,
            celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
            responses: {},
            contentSignature: signature,
          },
        }
      : {},
    completed: Array.from({ length: retained }, (_, i) => attempt(i, answers)),
    completionCounts: completed ? { q1: completed } : {},
    lowestScores: completed ? { q1: answers ? 100 : 0 } : {},
    latestScores: completed ? { q1: { percentage: answers ? 100 : 0, completedAt: timestamp } } : {},
    activity: {},
    completedIds: Object.fromEntries(Array.from({ length: completed }, (_, i) => [uuid(i), true])),
  },
  flashcards: { schemaVersion: 2, checkpoints: {}, completionCounts: {} },
});
const samples = [
  ['empty', envelope()],
  ['20 retained x 30 responses', envelope(20, 30)],
  ['200 retained x 100 responses + 1500 durable IDs', envelope(200, 100, 1500)],
  ['200 retained x 100 responses + 50000 durable IDs', envelope(200, 100, 50000)],
  ['200 retained x 300 responses', envelope(200, 300)],
  ['300-question saved quiz x 1200-char stems', envelope(0, 0, 0, bankSignature(300, 1200))],
  ['600-question saved quiz x 1200-char stems', envelope(0, 0, 0, bankSignature(600, 1200))],
];
const sizing = samples.map(([label, value]) => ({
  label,
  bytes: bytes(value),
  withinFileCap: bytes(value) <= limits.backupBytes,
  signatureBytes: value.quiz.active.q2 ? bytes(value.quiz.active.q2.contentSignature) : 0,
}));
assert(sizing[0].withinFileCap && sizing[1].withinFileCap && sizing[2].withinFileCap);
assert(!sizing[4].withinFileCap);
assert(sizing[5].signatureBytes <= limits.quizSignatureBytes);
assert(sizing[6].signatureBytes > limits.quizSignatureBytes);
// Generic parsed-tree limits, independently of domain record validation.
const treeCheck = (value) => {
  const todo = [[value, 0]];
  let scheduled = 1;
  while (todo.length) {
    const [entry, depth] = todo.pop();
    assert(depth <= limits.depth);
    if (entry && typeof entry === 'object') {
      if (Array.isArray(entry)) assert(entry.length <= limits.cardIdsPerList);
      let members = 0;
      for (const key in entry) {
        if (!Object.hasOwn(entry, key)) continue;
        assert(++members <= limits.completedIds);
        assert(!['__proto__', 'constructor', 'prototype'].includes(key));
        assert(++scheduled <= limits.nodes);
        todo.push([entry[key], depth + 1]);
      }
    }
  }
};
treeCheck(samples[2][1]);
assert.throws(() => treeCheck(JSON.parse('{"__proto__":{}}')));
let deep = {};
for (let i = 0; i < 17; i++) deep = { nested: deep };
assert.throws(() => treeCheck(deep));
assert.throws(() => treeCheck(Array(limits.nodes).fill(0)));
assert.throws(() => treeCheck(Array.from({ length: 26 }, () => Array(10000).fill(0))));
const isDate = (value) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
assert(isDate(timestamp));
assert(!isDate('2026-02-30T00:00:00.000Z'));
assert(!isDate('not-a-date'));
assert(!isDate('2026-10-13T08:00:00+08:00'));
const scoreCheck = (score) => {
  for (const key of ['correct', 'incorrect', 'unanswered', 'total'])
    assert(Number.isSafeInteger(score[key]) && score[key] >= 0);
  assert.equal(score.correct + score.incorrect + score.unanswered, score.total);
  assert.equal(score.percentage, score.total ? Math.round((score.correct / score.total) * 100) : 0);
};
scoreCheck({ correct: 2, incorrect: 1, unanswered: 0, total: 3, percentage: 67 });
assert.throws(() => scoreCheck({ correct: 2, incorrect: 1, unanswered: 0, total: 3, percentage: 66 }));
assert.throws(() => scoreCheck({ correct: 0.5, incorrect: 0, unanswered: 0, total: 0.5, percentage: 100 }));
const normalizeTimer = (source) => {
  if (source.timerStartedAt !== undefined) assert(isDate(source.timerStartedAt));
  const normalized = globalThis.structuredClone(source);
  delete normalized.timerStartedAt;
  return normalized;
};
const running = { elapsedMs: 5000, timerStartedAt: '2020-01-01T00:00:00.000Z' };
assert.deepEqual(normalizeTimer(running), { elapsedMs: 5000 });
assert.equal(running.timerStartedAt, '2020-01-01T00:00:00.000Z');
assert.throws(() => normalizeTimer({ elapsedMs: 5000, timerStartedAt: 'garbage' }));
const backing = envelope(200, 100, 1500);
const original = {
  quiz: JSON.stringify({ ...backing.quiz, revision: 'old-q' }),
  flashcards: JSON.stringify({ ...backing.flashcards, revision: 'old-f' }),
};
const target = {
  quiz: JSON.stringify({ ...backing.quiz, revision: uuid(100000) }),
  flashcards: JSON.stringify({ ...backing.flashcards, revision: uuid(100001) }),
};
const journal = {
  format: 'meducation-progress-restore-journal',
  version: 1,
  operationId: uuid(100002),
  decision: 'original',
  original,
  imported: target,
};
const committed = { ...journal, decision: 'imported' };
assert.equal(bytes(journal), bytes(committed));
assert(bytes(journal) <= limits.journalBytes);
assert.equal(bytes('é'.repeat(64)), limits.idBytes);
assert(bytes('é'.repeat(65)) > limits.idBytes);
const controlHeavy = {
  ...journal,
  original: { quiz: '\u0000'.repeat(2 * MiB), flashcards: '\u0000'.repeat(2 * MiB) },
};
assert(bytes(controlHeavy.original.quiz) + bytes(controlHeavy.original.flashcards) === limits.originalPairBytes);
assert(bytes(controlHeavy) > limits.journalBytes);
const report = {
  purpose: 'L0 Step 5 synthetic sizing and selected invariant audit',
  date: '2026-10-13',
  limits,
  sizing,
  journalExampleBytes: bytes(journal),
  controlHeavyJournalBytes: bytes(controlHeavy),
  journalStringEscapeMultiplier:
    bytes(journal) /
    (bytes(original.quiz) + bytes(original.flashcards) + bytes(target.quiz) + bytes(target.flashcards)),
  assertions:
    'File/signature boundaries; iterative depth/nodes/dangerous keys; canonical dates; rounded scores; timer normalization; equal-size journal decisions.',
  limitations: [
    'No complete application schema validator implemented.',
    'No personal storage/canonical question text used.',
    'UTF-8 limits are safety ceilings, not browser quota or capacity guarantees.',
  ],
};
await writeFile('/private/tmp/meducation-L0-step5-limits-evidence.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ sizing, journalExampleBytes: report.journalExampleBytes }, null, 2));
