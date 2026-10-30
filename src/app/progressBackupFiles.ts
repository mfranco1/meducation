import { parseProgressBackup, PROGRESS_BACKUP_MAX_BYTES, type BackupParseResult } from '../persistence/progressBackupCodec';

export type BackupFileReadResult = BackupParseResult | { ok: false; error: 'file-read-error' | 'invalid-compression' | 'aborted' };

// Gzip framing and deflate overhead can make an incompressible payload slightly larger.
const MAX_COMPRESSED_BYTES = PROGRESS_BACKUP_MAX_BYTES + 64 * 1024;

let activeDownload: { url: string; timer: number } | undefined;
export function revokeProgressDownload(): void {
  if (!activeDownload) return;
  window.clearTimeout(activeDownload.timer);
  URL.revokeObjectURL(activeDownload.url);
  activeDownload = undefined;
}

export function progressFileCapabilities() {
  return {
    read: typeof File !== 'undefined' && typeof File.prototype.stream === 'function' && typeof DecompressionStream !== 'undefined',
    download: typeof CompressionStream !== 'undefined' && typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function' && typeof URL.createObjectURL === 'function'
      && typeof URL.revokeObjectURL === 'function' && 'download' in document.createElement('a'),
  };
}

export async function compressProgressBackup(json: string): Promise<Blob> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
}

/** One download resource at a time; retain its URL briefly so the browser can consume it. */
export function downloadProgressBackup(blob: Blob, date = new Date().toISOString()): string | undefined {
  if (!progressFileCapabilities().download) return 'This browser cannot download progress files. Use another supported browser.';
  revokeProgressDownload();
  let url: string | undefined;
  try {
    url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `meducation-progress-${/^\d{4}-\d\d-\d\d/.exec(date)?.[0] ?? new Date().toISOString().slice(0, 10)}.json.gz`;
    anchor.click();
    activeDownload = { url, timer: window.setTimeout(revokeProgressDownload, 1_000) };
    return undefined;
  } catch {
    if (url) URL.revokeObjectURL(url);
    return 'The progress file could not be downloaded. Try again.';
  }
}

/** Bound both the compressed file and streamed output before parsing untrusted JSON. */
export async function readProgressBackupFile(file: Pick<File, 'size' | 'stream'>, signal?: AbortSignal): Promise<BackupFileReadResult> {
  if (signal?.aborted) return { ok: false, error: 'aborted' };
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_COMPRESSED_BYTES) return { ok: false, error: 'too-large' };
  let stream: ReturnType<File['stream']>;
  try { stream = file.stream(); }
  catch { return { ok: false, error: 'file-read-error' }; }
  try {
    const reader = stream.pipeThrough(new DecompressionStream('gzip'), { signal }).getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > PROGRESS_BACKUP_MAX_BYTES) {
          await reader.cancel();
          return { ok: false, error: 'too-large' };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const text = await new Blob(chunks).text();
    return signal?.aborted ? { ok: false, error: 'aborted' } : parseProgressBackup(text);
  } catch {
    return { ok: false, error: signal?.aborted ? 'aborted' : 'invalid-compression' };
  }
}
