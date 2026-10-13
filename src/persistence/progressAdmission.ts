import type { ProgressLease } from './progressCoordination';
import { createBrowserProgressCoordination, type ProgressCoordination, type ProgressCoordinationResult } from './progressCoordination';
import { recoverProgressPair, type ProgressStoragePort } from './progressRestore';
import { progressKey } from './progressCodec';
import { flashcardProgressKey } from './flashcardProgressCodec';

import { progressRestoreJournalKey } from './progressKeys';
export type RestoreJournalStatus = 'clear' | 'pending' | 'unavailable';
export type RestoreJournalReader = () => RestoreJournalStatus;
export type ProgressInitializationResult =
  | { kind: 'ready'; lease: ProgressLease }
  | { kind: 'read-only' }
  | { kind: 'unsupported-browser' | 'timed-out' | 'unavailable' | 'recovery-required' };

export class ProgressAdmissionError extends Error {
  constructor() {
    super('Progress access is not currently admitted.');
    this.name = 'ProgressAdmissionError';
  }
}

/** Shared read/write admission for the two learner progress repositories. */
export class ProgressAdmission {
  private lease?: ProgressLease;
  private readJournal?: RestoreJournalReader;
  private readOnly = false;
  private skipNextPageHideWrite = false;

  admit(lease: ProgressLease, readJournal: RestoreJournalReader): void {
    this.close();
    if (lease.mode !== 'shared' || !lease.valid || readJournal() !== 'clear') {
      lease.release();
      throw new ProgressAdmissionError();
    }
    this.lease = lease;
    this.readJournal = readJournal;
  }

  admitReadOnly(readJournal: RestoreJournalReader, lease?: ProgressLease): void {
    this.close();
    if ((lease && (lease.mode !== 'shared' || !lease.valid)) || readJournal() !== 'clear') {
      lease?.release();
      throw new ProgressAdmissionError();
    }
    this.lease = lease;
    this.readJournal = readJournal;
    this.readOnly = true;
  }

  get browsingOnly(): boolean { return this.readOnly && this.canRead; }
  get coordinatedReadOnly(): boolean { return this.browsingOnly && Boolean(this.lease?.valid); }

  get canRead(): boolean {
    if ((!this.lease?.valid && !this.readOnly) || !this.readJournal) return false;
    try {
      if (this.readJournal() === 'clear') return true;
    } catch { /* Storage access failure closes admission. */ }
    this.close();
    return false;
  }

  get ready(): boolean {
    if (!this.lease?.valid || !this.readJournal || this.readOnly) return false;
    try {
      if (this.readJournal() === 'clear') return true;
    } catch { /* Storage access failure closes admission. */ }
    this.close();
    return false;
  }

  assertReady(): void {
    if (!this.ready) throw new ProgressAdmissionError();
  }

  assertReadable(): void {
    if (!this.canRead) throw new ProgressAdmissionError();
  }

  /** Prevent an old quiz view from restoring pre-import bytes during our controlled reload. */
  suppressNextPageHideWrite(): void { this.skipNextPageHideWrite = true; }

  consumePageHideWriteSuppression(): boolean {
    const suppress = this.skipNextPageHideWrite;
    this.skipNextPageHideWrite = false;
    return suppress;
  }

  close(): void {
    this.lease?.release();
    this.lease = undefined;
    this.readJournal = undefined;
    this.readOnly = false;
  }
}

export function readRestoreJournalStatus(storage?: Pick<Storage, 'getItem'>): RestoreJournalStatus {
  try { return (storage ?? localStorage).getItem(progressRestoreJournalKey) === null ? 'clear' : 'pending'; }
  catch { return 'unavailable'; }
}

function storageCanReadProgress(storage: ProgressStoragePort): boolean {
  try {
    const status = readRestoreJournalStatus(storage);
    if (status !== 'clear') return false;
    storage.getItem(progressKey);
    storage.getItem(flashcardProgressKey);
    return readRestoreJournalStatus(storage) === 'clear';
  } catch { return false; }
}

function storageCanWriteProgress(storage: ProgressStoragePort): boolean {
  let key: string | undefined;
  try {
    key = `meducation.progress.capability-probe.${crypto.randomUUID()}`;
    if (storage.getItem(key) !== null) return false;
    storage.setItem(key, 'probe');
    if (storage.getItem(key) !== 'probe') throw new Error('storage-probe-readback-failed');
    storage.removeItem(key);
    if (storage.getItem(key) !== null) throw new Error('storage-probe-cleanup-failed');
    return true;
  } catch {
    if (key) { try { storage.removeItem(key); } catch { /* Preserve app data; a random probe key is not progress. */ } }
    return false;
  }
}

/** Retain participation across pagehide so synchronous quiz saves remain admitted. */
export function installProgressPageLifecycle(admission: ProgressAdmission, reload = () => window.location.reload()): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    admission.close();
    reload();
  };
  window.addEventListener('pageshow', onPageShow);
  return () => window.removeEventListener('pageshow', onPageShow);
}

export const learnerProgressAdmission = new ProgressAdmission();

function failedAcquisition(result: ProgressCoordinationResult): ProgressInitializationResult | undefined {
  return result.kind === 'acquired' ? undefined : { kind: result.kind };
}

/** Acquire shared participation and resolve any pending journal before app repositories mount. */
export async function initializeProgressAdmission(
  coordination: ProgressCoordination = createBrowserProgressCoordination(),
  suppliedStorage?: ProgressStoragePort,
): Promise<ProgressInitializationResult> {
  let storage: ProgressStoragePort;
  try { storage = suppliedStorage ?? localStorage; }
  catch { return { kind: 'unavailable' }; }

  const shared = await coordination.acquireShared();
  const sharedFailure = failedAcquisition(shared);
  if (sharedFailure) {
    if (sharedFailure.kind === 'unsupported-browser') {
      try {
        const journal = readRestoreJournalStatus(storage);
        if (journal === 'pending') return { kind: 'recovery-required' };
        if (journal === 'unavailable' || !storageCanReadProgress(storage)) return { kind: 'unavailable' };
        learnerProgressAdmission.admitReadOnly(() => readRestoreJournalStatus(storage));
        return { kind: 'read-only' };
      } catch { return { kind: 'unavailable' }; }
    }
    return sharedFailure;
  }
  if (shared.kind !== 'acquired') return { kind: 'unavailable' };
  let lease = shared.lease;
  let status = readRestoreJournalStatus(storage);
  if (status === 'unavailable') { lease.release(); return { kind: 'unavailable' }; }

  if (status === 'pending') {
    lease.release();
    const exclusive = await coordination.acquireExclusiveForRecovery();
    const exclusiveFailure = failedAcquisition(exclusive);
    if (exclusiveFailure) return exclusiveFailure;
    if (exclusive.kind !== 'acquired') return { kind: 'unavailable' };
    const recovery = recoverProgressPair(storage, exclusive.lease);
    exclusive.lease.release();
    if (recovery.kind === 'recovery-required') return { kind: 'recovery-required' };
    status = readRestoreJournalStatus(storage);
    if (status !== 'clear') return { kind: status === 'unavailable' ? 'unavailable' : 'recovery-required' };
    const rejoined = await coordination.acquireShared();
    const rejoinFailure = failedAcquisition(rejoined);
    if (rejoinFailure) return rejoinFailure;
    if (rejoined.kind !== 'acquired') return { kind: 'unavailable' };
    lease = rejoined.lease;
    status = readRestoreJournalStatus(storage);
  }

  if (status !== 'clear') { lease.release(); return { kind: status === 'unavailable' ? 'unavailable' : 'recovery-required' }; }
  if (!storageCanReadProgress(storage)) { lease.release(); return { kind: 'unavailable' }; }
  if (!storageCanWriteProgress(storage)) {
    try {
      learnerProgressAdmission.admitReadOnly(() => readRestoreJournalStatus(storage), lease);
      return { kind: 'read-only' };
    } catch { return { kind: 'unavailable' }; }
  }
  try { learnerProgressAdmission.admit(lease, () => readRestoreJournalStatus(storage)); }
  catch { lease.release(); return { kind: 'recovery-required' }; }
  return { kind: 'ready', lease };
}
