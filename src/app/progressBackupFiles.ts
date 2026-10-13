import { parseProgressBackup, PROGRESS_BACKUP_MAX_BYTES, type BackupParseResult } from '../persistence/progressBackupCodec';

export type BackupFileReadResult = BackupParseResult | { ok: false; error: 'file-read-error' };

let activeDownload: { url: string; timer: number } | undefined;
export function revokeProgressDownload(): void {
  if (!activeDownload) return;
  window.clearTimeout(activeDownload.timer);
  URL.revokeObjectURL(activeDownload.url);
  activeDownload = undefined;
}

export function progressFileCapabilities() {
  return {
    read: typeof File !== 'undefined' && typeof File.prototype.text === 'function',
    download: typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function'
      && typeof URL.revokeObjectURL === 'function' && 'download' in document.createElement('a'),
  };
}

/** One download resource at a time; retain its URL briefly so the browser can consume it. */
export function downloadProgressJson(json: string, date = new Date().toISOString(), prefix = 'meducation-progress'): string | undefined {
  if (!progressFileCapabilities().download) return 'This browser cannot download progress files. Use another supported browser.';
  revokeProgressDownload();
  let url: string | undefined;
  try {
    url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${prefix}-${/^\d{4}-\d\d-\d\d/.exec(date)?.[0] ?? new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    activeDownload = { url, timer: window.setTimeout(revokeProgressDownload, 1_000) };
    return undefined;
  } catch {
    if (url) URL.revokeObjectURL(url);
    return 'The progress file could not be downloaded. Try again.';
  }
}

/** File metadata and text are untrusted. Reject by declared size before reading bytes. */
export async function readProgressBackupFile(file: Pick<File, 'size' | 'text'>): Promise<BackupFileReadResult> {
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > PROGRESS_BACKUP_MAX_BYTES) return { ok: false, error: 'too-large' };
  let text: string;
  try { text = await file.text(); }
  catch { return { ok: false, error: 'file-read-error' }; }
  return parseProgressBackup(text);
}
