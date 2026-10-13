import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserProgressCoordination } from '../persistence/progressCoordination';
import type { ProgressLease } from '../persistence/progressCoordination';
import {
  captureBrowserProgressPair,
  restoreBrowserProgressPair,
  type ProgressPair,
} from '../persistence/progressRestore';
import { encodeBackupFromProgressPair } from '../persistence/progressBackupStorage';
import { encodeRawProgressRecovery } from '../persistence/progressBackupStorage';
import {
  learnerProgressAdmission,
  initializeProgressAdmission,
  readRestoreJournalStatus,
  rememberProgressRestore,
} from '../persistence/progressAdmission';
import {
  summarizeProgressBackup,
  type ProgressBackupSummary,
  type ProgressBackupV1,
} from '../persistence/progressBackupCodec';
import { downloadProgressJson, readProgressBackupFile, revokeProgressDownload } from './progressBackupFiles';

export interface ProgressBackupPreview {
  backup: ProgressBackupV1;
  summary: ProgressBackupSummary;
  original: ProgressPair;
  currentBackup?: string;
  currentSummary?: ProgressBackupSummary;
  currentProgressIssue?: 'corrupt' | 'invalid';
  rawRecovery?: string;
  rawRecoveryTooLarge?: boolean;
}

export interface ProgressBackupController {
  open: boolean;
  busy: boolean;
  committing: boolean;
  status?: string;
  preview?: ProgressBackupPreview;
  error?: string;
  recoveryRequired: boolean;
  restoreUnavailable?: boolean;
  show(): void;
  close(): void;
  chooseFile(file: Pick<File, 'size' | 'text'>): Promise<void>;
  download(): Promise<void>;
  downloadCurrent(): Promise<void>;
  downloadRawRecovery(): void;
  restore(): Promise<void>;
  retryRecovery(): Promise<void>;
}

function freezeBackup<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeBackup(child);
  return Object.freeze(value);
}

function parseErrorMessage(error: string): string {
  switch (error) {
    case 'too-large':
      return 'This file is larger than the 4 MiB progress backup limit.';
    case 'malformed-json':
      return 'This file is not valid JSON.';
    case 'wrong-format':
      return 'This file is not a Meducation progress backup.';
    case 'unsupported-version':
      return 'This progress backup uses a version this app cannot read.';
    case 'file-read-error':
      return 'The selected file could not be read. Choose it again to retry.';
    default:
      return 'This progress backup is invalid. Your saved progress has not changed.';
  }
}

export function useProgressBackup(onRefresh: () => void): ProgressBackupController {
  const coordination = useRef(createBrowserProgressCoordination());
  const operationGeneration = useRef(0);
  const restoring = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [status, setStatus] = useState<string>();
  const [preview, setPreview] = useState<ProgressBackupPreview>();
  const [error, setError] = useState<string>();
  const [recoveryRequired, setRecoveryRequired] = useState(false);

  useEffect(
    () => () => {
      operationGeneration.current += 1;
      revokeProgressDownload();
    },
    [],
  );

  const rejoin = useCallback(async () => {
    const result = await initializeProgressAdmission(coordination.current);
    if (result.kind !== 'ready' && result.kind !== 'read-only') {
      setRecoveryRequired(true);
      setError(
        result.kind === 'timed-out'
          ? 'Another Meducation tab is using progress. Close other tabs and retry recovery.'
          : 'Progress could not be safely re-opened. Keep this dialog open and retry recovery.',
      );
      return false;
    }
    setRecoveryRequired(false);
    if (result.kind === 'ready' || learnerProgressAdmission.coordinatedReadOnly) onRefresh();
    return true;
  }, [onRefresh]);

  const withExclusive = useCallback(
    async <T>(action: (lease: ProgressLease) => T) => {
      setBusy(true);
      setError(undefined);
      learnerProgressAdmission.close();
      // Let the browser's lock manager observe the released document lease before
      // issuing an ifAvailable exclusive request.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const access = await coordination.current.acquireExclusive();
      if (access.kind !== 'acquired') {
        await rejoin();
        setBusy(false);
        setError(
          access.kind === 'unavailable'
            ? 'Another Meducation tab is open. Close it and retry progress backup.'
            : 'This browser cannot perform safe progress backup operations.',
        );
        return undefined;
      }
      let result: T;
      let failed = false;
      try {
        result = action(access.lease);
      } catch {
        result = undefined as T;
        failed = true;
      } finally {
        access.lease.release();
      }
      if (readRestoreJournalStatus() !== 'clear') {
        setRecoveryRequired(true);
        setError('Progress recovery is required. Your saved data remains protected; retry recovery before continuing.');
        setBusy(false);
        return result;
      }
      await rejoin();
      setBusy(false);
      if (failed) setError('The backup operation could not be completed. Check browser storage and retry.');
      return result;
    },
    [rejoin],
  );

  const show = useCallback(() => {
    operationGeneration.current += 1;
    setError(undefined);
    setRecoveryRequired(false);
    setStatus(undefined);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    if (committing || recoveryRequired) return;
    operationGeneration.current += 1;
    setPreview(undefined);
    setError(undefined);
    setStatus(undefined);
    setBusy(false);
    setOpen(false);
  }, [committing, recoveryRequired]);

  const chooseFile = useCallback(
    async (file: Pick<File, 'size' | 'text'>) => {
      const generation = ++operationGeneration.current;
      setError(undefined);
      setStatus('Reading backup…');
      setBusy(true);
      const parsed = await readProgressBackupFile(file);
      if (generation !== operationGeneration.current) return;
      if (!parsed.ok) {
        setError(parseErrorMessage(parsed.error));
        setStatus(undefined);
        setBusy(false);
        return;
      }
      const summary = summarizeProgressBackup(parsed.value);
      if (!summary) {
        setError('This progress backup is invalid. Your saved progress has not changed.');
        setStatus(undefined);
        setBusy(false);
        return;
      }
      const result = await withExclusive((lease) => {
        const captured = captureBrowserProgressPair(lease);
        if (captured.kind !== 'captured') return { kind: 'unavailable' as const };
        const current = encodeBackupFromProgressPair(captured.pair);
        const recovery = current.ok
          ? undefined
          : encodeRawProgressRecovery(captured.pair, new Date().toISOString(), null, false);
        return {
          kind: 'captured' as const,
          pair: captured.pair,
          current: current.ok ? current.json : undefined,
          currentSummary: current.ok ? current.summary : undefined,
          issue: current.ok
            ? undefined
            : current.error === 'corrupt-progress'
              ? ('corrupt' as const)
              : ('invalid' as const),
          rawRecovery: recovery?.ok ? recovery.json : undefined,
          rawRecoveryTooLarge: recovery?.ok === false,
        };
      });
      if (!result || result.kind !== 'captured') {
        if (generation !== operationGeneration.current) return;
        if (result?.kind === 'unavailable') setError('Current progress could not be read safely. No replacement target was captured.');
        setStatus(undefined);
        setBusy(false);
        return;
      }
      if (generation !== operationGeneration.current) return;
      setPreview({
        backup: freezeBackup(parsed.value),
        summary,
        original: Object.freeze({ ...result.pair }),
        currentBackup: result.current,
        currentSummary: result.currentSummary,
        currentProgressIssue: result.issue,
        rawRecovery: result.rawRecovery,
        rawRecoveryTooLarge: result.rawRecoveryTooLarge,
      });
      setStatus(undefined);
      setBusy(false);
    },
    [withExclusive],
  );

  const download = useCallback(async () => {
    const generation = ++operationGeneration.current;
    setStatus('Preparing progress backup…');
    const result = await withExclusive((lease) => {
      const captured = captureBrowserProgressPair(lease);
      if (captured.kind !== 'captured') return { kind: 'unavailable' as const };
      const encoded = encodeBackupFromProgressPair(captured.pair);
      return encoded.ok ? { kind: 'ready' as const, ...encoded } : { kind: 'invalid' as const, error: encoded.error };
    });
    if (generation !== operationGeneration.current || !result) return;
    if (result.kind === 'ready') setError(downloadProgressJson(result.json, JSON.parse(result.json).exportedAt as string));
    else
      setError(
        result.kind === 'unavailable'
          ? 'Current progress could not be read safely.'
          : 'Saved progress could not be backed up. It has not been changed.',
      );
    setStatus(undefined);
  }, [withExclusive]);

  const restore = useCallback(async () => {
    if (!preview || restoring.current) return;
    restoring.current = true;
    setCommitting(true);
    setStatus('Restoring progress. Please keep this tab open.');
    const result = await withExclusive((lease) => restoreBrowserProgressPair(lease, preview.original, preview.backup));
    if (result?.kind === 'restored') {
      rememberProgressRestore();
      learnerProgressAdmission.suppressNextPageHideWrite();
      window.location.reload();
      return;
    }
    if (result?.kind === 'stale-preview') {
      setPreview(undefined);
      setError('Your progress changed while this preview was open. Choose the backup again to review it.');
    } else if (result?.kind === 'recovery-required') {
      setRecoveryRequired(true);
      setError(
        'Restore needs recovery before progress can be used. Your saved bytes and recovery journal have been preserved.',
      );
    } else if (result?.kind === 'storage-error')
      setError(
        'The backup could not be restored. Your current progress was preserved. Check browser storage and retry.',
      );
    else if (result?.kind === 'blocked') setError('Close other Meducation tabs and retry the restore.');
    if (result?.kind !== 'recovery-required') {
      restoring.current = false;
      setCommitting(false);
      setStatus(undefined);
    }
  }, [preview, withExclusive]);

  const retryRecovery = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    if (await rejoin()) {
      restoring.current = false;
      setCommitting(false);
      setPreview(undefined);
      setStatus(undefined);
    }
    setBusy(false);
  }, [rejoin]);

  return {
    open,
    busy,
    committing,
    status,
    preview,
    error,
    recoveryRequired,
    restoreUnavailable: learnerProgressAdmission.browsingOnly,
    show,
    close,
    chooseFile,
    download,
    downloadCurrent: async () => {
      if (preview?.currentBackup) setError(downloadProgressJson(preview.currentBackup, JSON.parse(preview.currentBackup).exportedAt as string));
    },
    downloadRawRecovery: () => {
      if (preview?.rawRecovery) setError(downloadProgressJson(preview.rawRecovery, undefined, 'meducation-progress-recovery-raw'));
    },
    restore,
    retryRecovery,
  };
}
