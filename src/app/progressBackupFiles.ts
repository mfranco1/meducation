import { parseProgressBackup, PROGRESS_BACKUP_MAX_BYTES, type BackupParseResult } from '../persistence/progressBackupCodec';

export type BackupFileReadResult = BackupParseResult | { ok: false; error: 'file-read-error' };

/** File metadata and text are untrusted. Reject by declared size before reading bytes. */
export async function readProgressBackupFile(file: Pick<File, 'size' | 'text'>): Promise<BackupFileReadResult> {
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > PROGRESS_BACKUP_MAX_BYTES) return { ok: false, error: 'too-large' };
  let text: string;
  try { text = await file.text(); }
  catch { return { ok: false, error: 'file-read-error' }; }
  return parseProgressBackup(text);
}
