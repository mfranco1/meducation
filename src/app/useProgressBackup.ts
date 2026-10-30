import { useCallback, useEffect, useRef, useState } from 'react';
import {
  exportBrowserProgress,
  rememberProgressChange,
  resetBrowserProgress,
  restoreBrowserProgress,
} from '../persistence/progressBackupStorage';
import {
  summarizeProgressBackup,
  type ProgressBackupSummary,
  type ProgressBackupV1,
} from '../persistence/progressBackupCodec';
import { compressProgressBackup, downloadProgressBackup, readProgressBackupFile, revokeProgressDownload } from './progressBackupFiles';

export interface ProgressBackupPreview {
  backup: ProgressBackupV1;
  summary: ProgressBackupSummary;
  currentSummary?: ProgressBackupSummary;
}

export interface ProgressBackupController {
  open: boolean;
  busy: boolean;
  committing: boolean;
  status?: string;
  notice?: string;
  preview?: ProgressBackupPreview;
  resetSummary?: ProgressBackupSummary;
  resetStep: boolean;
  error?: string;
  show(): void;
  close(): void;
  chooseFile(file: Pick<File, 'size' | 'stream'>): Promise<void>;
  download(): Promise<void>;
  restore(): void;
  requestReset(): void;
  cancelReset(): void;
  reset(): void;
}

function freezeBackup<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeBackup(child);
  return Object.freeze(value);
}

function parseErrorMessage(error: string): string {
  switch (error) {
    case 'too-large':
      return 'This backup exceeds the 4 MiB size limit.';
    case 'invalid-compression':
      return 'This file is not a valid compressed progress backup. Choose a .json.gz backup.';
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

export function useProgressBackup(): ProgressBackupController {
  const operationGeneration = useRef(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [status, setStatus] = useState<string>();
  const [preview, setPreview] = useState<ProgressBackupPreview>();
  const [resetStep, setResetStep] = useState(false);
  const [resetSummary, setResetSummary] = useState<ProgressBackupSummary>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(
    () => () => {
      operationGeneration.current += 1;
      revokeProgressDownload();
    },
    [],
  );

  const show = useCallback(() => {
    operationGeneration.current += 1;
    setError(undefined);
    setNotice(undefined);
    setStatus(undefined);
    setResetStep(false);
    setResetSummary(undefined);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    if (committing) return;
    operationGeneration.current += 1;
    setPreview(undefined);
    setError(undefined);
    setNotice(undefined);
    setStatus(undefined);
    setBusy(false);
    setResetStep(false);
    setResetSummary(undefined);
    setOpen(false);
  }, [committing]);

  const chooseFile = useCallback(async (file: Pick<File, 'size' | 'stream'>) => {
    const generation = ++operationGeneration.current;
    setError(undefined);
    setNotice(undefined);
    setStatus('Reading backup…');
    setBusy(true);
    const parsed = await readProgressBackupFile(file);
    if (generation !== operationGeneration.current) return;
    setStatus(undefined);
    setBusy(false);
    const summary = parsed.ok ? summarizeProgressBackup(parsed.value) : undefined;
    if (!parsed.ok || !summary) {
      setError(parseErrorMessage(parsed.ok ? 'invalid-progress' : parsed.error));
      return;
    }
    const current = exportBrowserProgress();
    setPreview({
      backup: freezeBackup(parsed.value),
      summary,
      currentSummary: current.ok ? current.summary : undefined,
    });
  }, []);

  const download = useCallback(async () => {
    const generation = ++operationGeneration.current;
    setError(undefined);
    setNotice(undefined);
    const exported = exportBrowserProgress();
    if (!exported.ok) {
      setError(exported.error === 'unavailable'
        ? 'Current progress could not be read.'
        : 'Saved progress could not be backed up. It has not been changed.');
      return;
    }
    setBusy(true);
    setStatus('Preparing backup…');
    try {
      const blob = await compressProgressBackup(exported.json);
      if (generation !== operationGeneration.current) return;
      const failure = downloadProgressBackup(blob, (JSON.parse(exported.json) as { exportedAt: string }).exportedAt);
      setError(failure);
      setNotice(failure ? undefined : 'Backup downloaded.');
    } catch {
      if (generation === operationGeneration.current) setError('The progress file could not be downloaded. Try again.');
    } finally {
      if (generation === operationGeneration.current) {
        setBusy(false);
        setStatus(undefined);
      }
    }
  }, []);

  const restore = useCallback(() => {
    if (!preview || committing) return;
    setCommitting(true);
    setStatus('Restoring progress. Please keep this tab open.');
    if (restoreBrowserProgress(preview.backup)) {
      rememberProgressChange('restored');
      window.location.reload();
      return;
    }
    setError('The backup could not be restored. Nothing was changed. Check browser storage and retry.');
    setCommitting(false);
    setStatus(undefined);
  }, [preview, committing]);

  const requestReset = useCallback(() => {
    setError(undefined);
    setNotice(undefined);
    setPreview(undefined);
    const current = exportBrowserProgress();
    setResetSummary(current.ok ? current.summary : undefined);
    setResetStep(true);
  }, []);

  const cancelReset = useCallback(() => {
    setResetStep(false);
    setResetSummary(undefined);
    setError(undefined);
    setNotice(undefined);
  }, []);

  const reset = useCallback(() => {
    if (committing) return;
    setCommitting(true);
    setStatus('Resetting progress. Please keep this tab open.');
    if (resetBrowserProgress()) {
      rememberProgressChange('reset');
      window.location.reload();
      return;
    }
    setError('Progress could not be reset. Nothing was changed. Check browser storage and retry.');
    setCommitting(false);
    setStatus(undefined);
  }, [committing]);

  return {
    open,
    busy,
    committing,
    status,
    notice,
    preview,
    resetSummary,
    resetStep,
    error,
    show,
    close,
    chooseFile,
    download,
    restore,
    requestReset,
    cancelReset,
    reset,
  };
}
