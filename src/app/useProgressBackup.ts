import { useCallback, useEffect, useRef, useState } from 'react';
import {
  exportBrowserProgress,
  rememberProgressRestore,
  restoreBrowserProgress,
} from '../persistence/progressBackupStorage';
import {
  summarizeProgressBackup,
  type ProgressBackupSummary,
  type ProgressBackupV1,
} from '../persistence/progressBackupCodec';
import { downloadProgressJson, readProgressBackupFile, revokeProgressDownload } from './progressBackupFiles';

export interface ProgressBackupPreview {
  backup: ProgressBackupV1;
  summary: ProgressBackupSummary;
  currentBackup?: string;
  currentSummary?: ProgressBackupSummary;
  currentProgressIssue?: 'corrupt' | 'invalid';
}

export interface ProgressBackupController {
  open: boolean;
  busy: boolean;
  committing: boolean;
  status?: string;
  preview?: ProgressBackupPreview;
  error?: string;
  show(): void;
  close(): void;
  chooseFile(file: Pick<File, 'size' | 'text'>): Promise<void>;
  download(): void;
  downloadCurrent(): void;
  restore(): void;
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

function downloadJson(json: string): string | undefined {
  return downloadProgressJson(json, (JSON.parse(json) as { exportedAt: string }).exportedAt);
}

export function useProgressBackup(): ProgressBackupController {
  const operationGeneration = useRef(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [status, setStatus] = useState<string>();
  const [preview, setPreview] = useState<ProgressBackupPreview>();
  const [error, setError] = useState<string>();

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
    setStatus(undefined);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    if (committing) return;
    operationGeneration.current += 1;
    setPreview(undefined);
    setError(undefined);
    setStatus(undefined);
    setBusy(false);
    setOpen(false);
  }, [committing]);

  const chooseFile = useCallback(async (file: Pick<File, 'size' | 'text'>) => {
    const generation = ++operationGeneration.current;
    setError(undefined);
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
      currentBackup: current.ok ? current.json : undefined,
      currentSummary: current.ok ? current.summary : undefined,
      currentProgressIssue: current.ok ? undefined : current.error === 'invalid-progress' ? 'invalid' : 'corrupt',
    });
  }, []);

  const download = useCallback(() => {
    const exported = exportBrowserProgress();
    setError(
      exported.ok
        ? downloadJson(exported.json)
        : exported.error === 'unavailable'
          ? 'Current progress could not be read.'
          : 'Saved progress could not be backed up. It has not been changed.',
    );
  }, []);

  const restore = useCallback(() => {
    if (!preview || committing) return;
    setCommitting(true);
    setStatus('Restoring progress. Please keep this tab open.');
    if (restoreBrowserProgress(preview.backup)) {
      rememberProgressRestore();
      window.location.reload();
      return;
    }
    setError('The backup could not be restored. Nothing was changed. Check browser storage and retry.');
    setCommitting(false);
    setStatus(undefined);
  }, [preview, committing]);

  return {
    open,
    busy,
    committing,
    status,
    preview,
    error,
    show,
    close,
    chooseFile,
    download,
    downloadCurrent: () => {
      if (preview?.currentBackup) setError(downloadJson(preview.currentBackup));
    },
    restore,
  };
}
