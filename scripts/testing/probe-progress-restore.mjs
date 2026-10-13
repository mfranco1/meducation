// Design model only: synthetic in-memory values, no browser/application storage.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const keys = { quiz: 'model.quiz', flashcards: 'model.flashcards', journal: 'model.journal' };
const imported = {
  quiz: '{"model":"new-quiz","revision":"new-q"}',
  flashcards: '{"model":"new-cards","revision":"new-f"}',
};
class Interrupted extends Error {}
class Store {
  constructor(pair, failAt, timing) {
    this.values = new Map(Object.entries(pair).filter(([, value]) => value !== null));
    this.trace = [];
    this.failAt = failAt;
    this.timing = timing;
  }
  call(kind, key, action) {
    this.trace.push({ kind, key });
    const fails = this.trace.length === this.failAt;
    if (fails && this.timing === 'before') throw new Interrupted();
    const value = action();
    if (fails && this.timing === 'after') throw new Interrupted();
    return value;
  }
  getItem(key) {
    return this.call('get', key, () => this.values.get(key) ?? null);
  }
  setItem(key, value) {
    return this.call('set', key, () => this.values.set(key, value));
  }
  removeItem(key) {
    return this.call('remove', key, () => this.values.delete(key));
  }
  pair() {
    return { quiz: this.values.get(keys.quiz) ?? null, flashcards: this.values.get(keys.flashcards) ?? null };
  }
}
const parse = (raw) => {
  const journal = JSON.parse(raw);
  assert.equal(journal.format, 'meducation-progress-restore-journal');
  assert.equal(journal.version, 1);
  assert.equal(journal.operationId, 'model-operation');
  assert(['original', 'imported'].includes(journal.decision));
  for (const name of ['quiz', 'flashcards']) {
    assert(journal.original[name] === null || typeof journal.original[name] === 'string');
    assert.equal(typeof journal.imported[name], 'string');
  }
  return journal;
};
const setPair = (storage, pair) => {
  for (const name of ['quiz', 'flashcards']) {
    if (storage.getItem(keys[name]) === pair[name]) continue;
    if (pair[name] === null) storage.removeItem(keys[name]);
    else storage.setItem(keys[name], pair[name]);
  }
  assert.deepEqual({ quiz: storage.getItem(keys.quiz), flashcards: storage.getItem(keys.flashcards) }, pair);
};
const restore = (storage, original) => {
  assert.equal(storage.getItem(keys.journal), null);
  assert.deepEqual({ quiz: storage.getItem(keys.quiz), flashcards: storage.getItem(keys.flashcards) }, original);
  const journal = {
    format: 'meducation-progress-restore-journal',
    version: 1,
    operationId: 'model-operation',
    decision: 'original',
    original,
    imported,
  };
  const prepared = JSON.stringify(journal);
  storage.setItem(keys.journal, prepared);
  assert.equal(storage.getItem(keys.journal), prepared);
  setPair(storage, imported);
  const committed = JSON.stringify({ ...journal, decision: 'imported' });
  assert.equal(prepared.length, committed.length);
  storage.setItem(keys.journal, committed);
  assert.equal(storage.getItem(keys.journal), committed);
  storage.removeItem(keys.journal);
  assert.equal(storage.getItem(keys.journal), null);
};
const recover = (storage) => {
  const raw = storage.getItem(keys.journal);
  if (raw === null) return 'no-journal';
  const journal = parse(raw);
  // Unexpected external changes must be preserved, not silently overwritten.
  for (const name of ['quiz', 'flashcards']) {
    const value = storage.getItem(keys[name]);
    assert(value === journal.original[name] || value === journal.imported[name]);
  }
  const pair = journal[journal.decision];
  setPair(storage, pair);
  storage.removeItem(keys.journal);
  assert.equal(storage.getItem(keys.journal), null);
  return journal.decision;
};
const originals = [
  { quiz: '{"model":"old-quiz"}', flashcards: '{"model":"old-cards"}' },
  { quiz: null, flashcards: null },
  { quiz: 'CORRUPT ORIGINAL BYTES', flashcards: '{"model":"old-cards"}' },
];
const report = { purpose: 'L0 Step 4 API-visible restore/recovery design model', date: '2026-10-13', cases: [] };
for (const original of originals) {
  const seed = () => ({ [keys.quiz]: original.quiz, [keys.flashcards]: original.flashcards });
  const baseline = new Store(seed());
  restore(baseline, original);
  assert.deepEqual(baseline.pair(), imported);
  assert.equal(baseline.values.has(keys.journal), false);
  for (const timing of ['before', 'after']) {
    for (let failAt = 1; failAt <= baseline.trace.length; failAt++) {
      const storage = new Store(seed(), failAt, timing);
      try {
        restore(storage, original);
      } catch (error) {
        assert(error instanceof Interrupted);
      }
      storage.failAt = undefined;
      const raw = storage.values.get(keys.journal);
      const expected =
        raw === undefined
          ? storage.pair().quiz === imported.quiz
            ? imported
            : original
          : parse(raw).decision === 'imported'
            ? imported
            : original;
      const pending = new Map(storage.values);
      // Interrupt each operation in recovery too; subsequent retry must converge.
      const recoveryBaseline = new Store({});
      recoveryBaseline.values = new Map(pending);
      recover(recoveryBaseline);
      for (let recoveryAt = 1; recoveryAt <= recoveryBaseline.trace.length; recoveryAt++) {
        const retry = new Store({}, recoveryAt, timing);
        retry.values = new Map(pending);
        try {
          recover(retry);
        } catch (error) {
          assert(error instanceof Interrupted);
        }
        retry.failAt = undefined;
        recover(retry);
        assert.deepEqual(retry.pair(), expected);
        assert.equal(retry.values.has(keys.journal), false);
      }
      recover(storage);
      recover(storage);
      assert.deepEqual(storage.pair(), expected);
      assert.equal(storage.values.has(keys.journal), false);
      report.cases.push({
        originalKind: original.quiz === null ? 'absent' : original.quiz.startsWith('CORRUPT') ? 'corrupt' : 'present',
        timing,
        failAt,
        operation: baseline.trace[failAt - 1],
        recoveryFaultsChecked: recoveryBaseline.trace.length,
        passed: true,
      });
    }
  }
}
// Fail-closed audit cases retain all raw values and the unresolved journal.
for (const raw of ['not JSON', '{"format":"unknown"}']) {
  const storage = new Store({ [keys.quiz]: 'current-q', [keys.flashcards]: 'current-f', [keys.journal]: raw });
  const before = new Map(storage.values);
  assert.throws(() => recover(storage));
  assert.deepEqual(storage.values, before);
}
const unexpected = new Store({
  [keys.quiz]: 'newer-external-data',
  [keys.flashcards]: imported.flashcards,
  [keys.journal]: JSON.stringify({
    format: 'meducation-progress-restore-journal',
    version: 1,
    operationId: 'model-operation',
    decision: 'imported',
    original: originals[0],
    imported,
  }),
});
const before = new Map(unexpected.values);
assert.throws(() => recover(unexpected));
assert.deepEqual(unexpected.values, before);
report.failClosedCases = 3;
report.limitations = [
  'Not production journal/backup validation.',
  'No real browser quota, Web Locks or device power-loss model.',
  'One injected interruption at a time, including before/after API effects.',
];
await writeFile('/private/tmp/meducation-L0-step4-restore-evidence.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `${report.cases.length} restore interruption cases passed, with recovery interruption/retry checks; 3 fail-closed cases passed.`,
);
