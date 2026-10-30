import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { gzipSync, gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backup from '../../tests/fixtures/progress-backups/populated-v1.json';
import { compressProgressBackup, readProgressBackupFile } from './progressBackupFiles';
import { PROGRESS_BACKUP_MAX_BYTES } from '../persistence/progressBackupCodec';

// jsdom's Blob/File do not implement streams. Use the platform implementations.
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
});
afterEach(() => vi.unstubAllGlobals());

const fileOf = (data: Uint8Array, name = 'backup.json.gz', type = 'application/gzip') => new NodeFile([data], name, { type }) as unknown as File;
const compressedFile = (body: string) => fileOf(gzipSync(body));

describe('progress backup file reader', () => {
  it('rejects oversized compressed files before reading', async () => {
    const stream = vi.fn();
    expect(await readProgressBackupFile({ size: 5 * 1024 * 1024, stream })).toEqual({ ok: false, error: 'too-large' });
    expect(stream).not.toHaveBeenCalled();
  });

  it('accepts gzip regardless of filename and MIME hints', async () => {
    const file = fileOf(gzipSync(JSON.stringify(backup)), 'unrelated', 'text/plain');
    expect((await readProgressBackupFile(file)).ok).toBe(true);
  });

  it('rejects plain JSON, truncated gzip and corrupt gzip', async () => {
    const gzip = gzipSync(JSON.stringify(backup));
    const corrupt = Buffer.from(gzip);
    corrupt[corrupt.length - 8] ^= 0xff;
    for (const data of [Buffer.from(JSON.stringify(backup)), gzip.subarray(0, -4), corrupt]) {
      expect(await readProgressBackupFile(fileOf(data))).toEqual({ ok: false, error: 'invalid-compression' });
    }
  });

  it('bounds decompressed bytes even for a small compressed file', async () => {
    expect(await readProgressBackupFile(compressedFile(' '.repeat(PROGRESS_BACKUP_MAX_BYTES + 1)))).toEqual({ ok: false, error: 'too-large' });
  });

  it('keeps JSON validation and reports file read errors', async () => {
    expect(await readProgressBackupFile(compressedFile('not JSON'))).toEqual({ ok: false, error: 'malformed-json' });
    expect(await readProgressBackupFile(compressedFile('{"format":"nope"}'))).toEqual({ ok: false, error: 'wrong-format' });
    expect(await readProgressBackupFile({ size: 10, stream: () => { throw new Error('private file'); } })).toEqual({ ok: false, error: 'file-read-error' });
  });

  it('exports a smaller gzip file that restores the same progress', async () => {
    const json = JSON.stringify(backup);
    const blob = await compressProgressBackup(json);
    expect(blob.type).toBe('application/gzip');
    expect(blob.size).toBeLessThan(new TextEncoder().encode(json).length);
    expect(gunzipSync(Buffer.from(await blob.arrayBuffer())).toString()).toBe(json);
    expect(await readProgressBackupFile(blob)).toEqual(await readProgressBackupFile(compressedFile(json)));
  });
});

it('initiates downloads before revoking URLs and cleans replacement, failure and dismissal resources', async () => {
  const { downloadProgressBackup, revokeProgressDownload } = await import('./progressBackupFiles');
  vi.useFakeTimers();
  const created = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second').mockReturnValueOnce('blob:failed');
  const revoked = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: created, revokeObjectURL: revoked });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(revoked).not.toHaveBeenCalledWith(this.href);
    expect(this.download).toMatch(/^meducation-progress-2026-10-13\.json\.gz$/);
  });
  try {
    expect(downloadProgressBackup(new Blob(['{}']), '2026-10-13T00:00:00.000Z')).toBeUndefined();
    expect(revoked).not.toHaveBeenCalled();
    downloadProgressBackup(new Blob(['{}']), '2026-10-13T00:00:00.000Z');
    expect(revoked).toHaveBeenCalledWith('blob:first');
    vi.advanceTimersByTime(1000);
    expect(revoked).toHaveBeenCalledWith('blob:second');
    click.mockImplementationOnce(() => { throw new Error('download denied'); });
    expect(downloadProgressBackup(new Blob(['{}']))).toContain('could not be downloaded');
    expect(revoked).toHaveBeenCalledWith('blob:failed');
  } finally {
    revokeProgressDownload(); click.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers();
  }
});
