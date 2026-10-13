import { describe, expect, it } from 'vitest';
import backupFixture from '../../tests/fixtures/progress-backups/populated-v1.json';
import { progressKey } from './progressCodec';
import { flashcardProgressKey } from './flashcardProgressCodec';
import { progressRestoreJournalKey } from './progressKeys';
import { validateProgressBackup } from './progressBackupCodec';
import { captureProgressPair, recoverProgressPair, restoreProgressPair, type ProgressStoragePort } from './progressRestore';
import type { ProgressLease } from './progressCoordination';
import { LocalAttemptRepository } from './localRepository';
import { LocalFlashcardProgressRepository } from './localFlashcardProgressRepository';

const backupResult = validateProgressBackup(backupFixture);
if (!backupResult.ok) throw new Error('Invalid synthetic backup fixture.');
const backup = backupResult.value;

function lease(): ProgressLease { return { mode: 'exclusive', valid: true, release: () => undefined }; }

class MemoryStorage implements ProgressStoragePort {
  readonly values = new Map<string, string>();
  journalReads = 0;
  throwJournalReads = new Set<number>();
  throwAfterSet?: (key: string, value: string) => boolean;
  throwBeforeSet?: (key: string, value: string) => boolean;
  throwBeforeRemove?: (key: string) => boolean;

  getItem(key: string): string | null {
    if (key === progressRestoreJournalKey && this.throwJournalReads.has(++this.journalReads)) throw new Error('injected read failure');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throwBeforeSet?.(key, value)) throw new Error('injected pre-write failure');
    this.values.set(key, value);
    if (this.throwAfterSet?.(key, value)) throw new Error('injected post-write failure');
  }
  removeItem(key: string): void {
    if (this.throwBeforeRemove?.(key)) throw new Error('injected remove failure');
    this.values.delete(key);
  }
}

function originalPair(storage: MemoryStorage) {
  storage.values.set(progressKey, '{corrupt quiz bytes');
  storage.values.set(flashcardProgressKey, '{corrupt flashcard bytes');
  return { quiz: '{corrupt quiz bytes', flashcards: '{corrupt flashcard bytes' };
}

function uuidFactory() {
  let value = 1;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, '0')}`;
}

describe('paired progress restore journal', () => {
  it('captures an exact pair and restores both targets with fresh revisions', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    const activeLease = lease();
    expect(captureProgressPair(storage, activeLease)).toEqual({ kind: 'captured', pair: original });
    expect(restoreProgressPair(storage, activeLease, original, backup, uuidFactory())).toEqual({ kind: 'restored' });
    expect(storage.getItem(progressRestoreJournalKey)).toBeNull();
    const restoredQuiz = JSON.parse(storage.getItem(progressKey)!);
    const restoredFlashcards = JSON.parse(storage.getItem(flashcardProgressKey)!);
    expect(restoredQuiz.revision).not.toBe('initial');
    expect(restoredFlashcards.revision).not.toBe('initial');
    expect(restoredQuiz.completedIds['pruned-completion']).toBe(true);
    expect(restoredFlashcards.dailyStats.firstDay).toBe('2026-10-01');
  });

  it('refuses stale previews and does not write when exclusive ownership is absent', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    storage.values.set(progressKey, 'newer quiz value');
    const before = [...storage.values.entries()];
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'stale-preview' });
    expect([...storage.values.entries()]).toEqual(before);
    expect(restoreProgressPair(storage, { ...lease(), mode: 'shared' }, original, backup, uuidFactory())).toEqual({ kind: 'blocked' });
  });

  it('rolls back both exact originals after a target write fails', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    let failed = false;
    storage.throwAfterSet = key => {
      if (!failed && key === flashcardProgressKey) { failed = true; return true; }
      return false;
    };
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'storage-error' });
    expect(storage.getItem(progressKey)).toBe(original.quiz);
    expect(storage.getItem(flashcardProgressKey)).toBe(original.flashcards);
    expect(storage.getItem(progressRestoreJournalKey)).toBeNull();
  });

  it('uses the persisted imported marker when a marker write succeeds and then throws', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    storage.throwAfterSet = (key, value) => key === progressRestoreJournalKey && value.includes('"decision":"imported"');
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'restored' });
    expect(storage.getItem(progressRestoreJournalKey)).toBeNull();
    expect(JSON.parse(storage.getItem(progressKey)!).completedIds['pruned-completion']).toBe(true);
  });

  it('rolls forward when the imported marker is persisted but its readback fails', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    storage.throwJournalReads = new Set([3]);
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'restored' });
    expect(storage.getItem(progressRestoreJournalKey)).toBeNull();
    expect(JSON.parse(storage.getItem(progressKey)!).completedIds['pruned-completion']).toBe(true);
  });

  it('retains the journal when rollback cannot verify, then converges on retry', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    storage.throwAfterSet = key => key === progressKey;
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'recovery-required' });
    expect(storage.getItem(progressRestoreJournalKey)).not.toBeNull();
    storage.throwAfterSet = undefined;
    expect(recoverProgressPair(storage, lease())).toEqual({ kind: 'recovered', decision: 'original' });
    expect(storage.getItem(progressKey)).toBe(original.quiz);
    expect(storage.getItem(flashcardProgressKey)).toBe(original.flashcards);
  });

  it('keeps an uncertain prepared journal gated, then recovers the exact original pair on retry', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    storage.throwJournalReads = new Set([2, 3]);
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'recovery-required' });
    expect(storage.getItem(progressRestoreJournalKey)).not.toBeNull();
    storage.throwJournalReads.clear();
    expect(recoverProgressPair(storage, lease())).toEqual({ kind: 'recovered', decision: 'original' });
    expect(storage.getItem(progressKey)).toBe(original.quiz);
    expect(storage.getItem(flashcardProgressKey)).toBe(original.flashcards);
    expect(recoverProgressPair(storage, lease())).toEqual({ kind: 'none' });
  });

  it('preserves a third unexpected storage value and the journal for explicit conflict handling', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    storage.throwJournalReads = new Set([2, 3]);
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'recovery-required' });
    storage.throwJournalReads.clear();
    storage.values.set(progressKey, 'external third value');
    expect(recoverProgressPair(storage, lease())).toEqual({ kind: 'recovery-required' });
    expect(storage.getItem(progressKey)).toBe('external third value');
    expect(storage.getItem(progressRestoreJournalKey)).not.toBeNull();
  });

  it('removes originally absent keys during rollback', () => {
    const storage = new MemoryStorage();
    const original = { quiz: null, flashcards: null };
    let failed = false;
    storage.throwAfterSet = key => {
      if (!failed && key === flashcardProgressKey) { failed = true; return true; }
      return false;
    };
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'storage-error' });
    expect(storage.getItem(progressKey)).toBeNull();
    expect(storage.getItem(flashcardProgressKey)).toBeNull();
    expect(storage.getItem(progressRestoreJournalKey)).toBeNull();
  });

  it('leaves originals untouched when prepared-journal reservation fails', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    const before = [...storage.values.entries()];
    storage.throwBeforeSet = key => key === progressRestoreJournalKey;
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'storage-error' });
    expect([...storage.values.entries()]).toEqual(before);
  });

  it('rolls back if the first target write fails before changing storage', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    storage.throwBeforeSet = key => key === progressKey;
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'storage-error' });
    expect(storage.getItem(progressKey)).toBe(original.quiz);
    expect(storage.getItem(flashcardProgressKey)).toBe(original.flashcards);
    expect(storage.getItem(progressRestoreJournalKey)).toBeNull();
  });

  it('keeps an imported pair recoverable when journal cleanup fails once', () => {
    const storage = new MemoryStorage();
    const original = originalPair(storage);
    let failures = 0;
    storage.throwBeforeRemove = key => key === progressRestoreJournalKey && failures++ === 0;
    expect(restoreProgressPair(storage, lease(), original, backup, uuidFactory())).toEqual({ kind: 'restored' });
    expect(storage.getItem(progressRestoreJournalKey)).toBeNull();
    expect(JSON.parse(storage.getItem(progressKey)!).completedIds['pruned-completion']).toBe(true);
  });

  it('fails closed on malformed or oversized journals without changing their bytes', () => {
    const storage = new MemoryStorage();
    for (const raw of ['{bad', 'x'.repeat(20 * 1024 * 1024 + 1)]) {
      storage.values.set(progressRestoreJournalKey, raw);
      const before = [...storage.values.entries()];
      expect(recoverProgressPair(storage, lease())).toEqual({ kind: 'recovery-required' });
      expect([...storage.values.entries()]).toEqual(before);
    }
  });
});

/** Simulate process interruption: all storage access stops at the chosen call until restart. */
class InterruptedStorage extends MemoryStorage {
  calls = 0;
  stopAt = Infinity;
  after = false;
  stopped = false;
  private call<T>(operation: () => T): T {
    if (this.stopped || (++this.calls === this.stopAt && !this.after)) {
      this.stopped = true;
      throw new Error('interrupted');
    }
    const result = operation();
    if (this.calls === this.stopAt) { this.stopped = true; throw new Error('interrupted'); }
    return result;
  }
  override getItem(key: string) { return this.call(() => super.getItem(key)); }
  override setItem(key: string, value: string) { return this.call(() => super.setItem(key, value)); }
  override removeItem(key: string) { return this.call(() => super.removeItem(key)); }
  restart() { this.stopped = false; this.stopAt = Infinity; this.calls = 0; }
}

it('converges after interruption before/after every production storage call and every recovery call', () => {
  for (const absent of [false, true]) {
    const baseline = new InterruptedStorage();
    const original = absent ? { quiz: null, flashcards: null } : originalPair(baseline);
    expect(restoreProgressPair(baseline, lease(), original, backup, uuidFactory()).kind).toBe('restored');
    const targets = { quiz: baseline.values.get(progressKey)!, flashcards: baseline.values.get(flashcardProgressKey)! };
    const calls = baseline.calls;
    for (let stopAt = 1; stopAt <= calls; stopAt++) for (const after of [false, true]) {
      const interrupted = new InterruptedStorage();
      if (!absent) originalPair(interrupted);
      Object.assign(interrupted, { stopAt, after });
      restoreProgressPair(interrupted, lease(), original, backup, uuidFactory());
      const saved = new Map(interrupted.values);
      const journal = saved.get(progressRestoreJournalKey);
      const selected = journal ? JSON.parse(journal).decision === 'imported' ? targets : original
        : saved.get(progressKey) === targets.quiz ? targets : original;
      interrupted.restart();
      expect(['none', 'recovered']).toContain(recoverProgressPair(interrupted, lease()).kind);
      expect(captureProgressPair(interrupted, lease())).toEqual({ kind: 'captured', pair: selected });
      expect(interrupted.values.has(progressRestoreJournalKey)).toBe(false);
      const recoveryCalls = interrupted.calls - 2;
      const verified = new Map(interrupted.values);
      expect(recoverProgressPair(interrupted, lease())).toEqual({ kind: 'none' });
      expect(interrupted.values).toEqual(verified);
      const quizRepository = new LocalAttemptRepository(interrupted);
      const cardRepository = new LocalFlashcardProgressRepository(interrupted);
      const quizSnapshot = quizRepository.getSnapshot();
      const cardSnapshot = cardRepository.getSnapshot();
      expect(quizSnapshot.completed).toEqual(selected.quiz === targets.quiz ? backup.quiz.completed : []);
      expect(cardSnapshot.completionCounts).toEqual(selected.flashcards === targets.flashcards ? backup.flashcards.completionCounts : {});
      expect(quizRepository.getSnapshot()).toBe(quizSnapshot);
      expect(cardRepository.getSnapshot()).toBe(cardSnapshot);
      expect(interrupted.values).toEqual(verified);
      // Repeat each recovery interruption with fresh storage, then restart twice.
      for (let recoveryStop = 1; recoveryStop <= recoveryCalls; recoveryStop++) for (const recoveryAfter of [false, true]) {
        const restarted = new InterruptedStorage();
        for (const [key, value] of saved) restarted.values.set(key, value);
        Object.assign(restarted, { stopAt: recoveryStop, after: recoveryAfter });
        recoverProgressPair(restarted, lease());
        restarted.restart();
        expect(['none', 'recovered']).toContain(recoverProgressPair(restarted, lease()).kind);
        expect(captureProgressPair(restarted, lease())).toEqual({ kind: 'captured', pair: selected });
        expect(restarted.values.has(progressRestoreJournalKey)).toBe(false);
        expect(recoverProgressPair(restarted, lease())).toEqual({ kind: 'none' });
      }
    }
  }
});
