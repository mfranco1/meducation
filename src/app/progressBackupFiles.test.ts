import { describe, expect, it, vi } from 'vitest';
import backup from '../../tests/fixtures/progress-backups/populated-v1.json';
import { readProgressBackupFile } from './progressBackupFiles';

describe('progress backup file reader', () => {
  it('checks File.size before invoking text()', async () => {
    const text = vi.fn(async () => JSON.stringify(backup));
    expect(await readProgressBackupFile({ size: 4 * 1024 * 1024 + 1, text })).toEqual({ ok: false, error: 'too-large' });
    expect(text).not.toHaveBeenCalled();
  });

  it('accepts a supported JSON file regardless of MIME and filename hints', async () => {
    const body = JSON.stringify(backup);
    const result = await readProgressBackupFile({ size: new TextEncoder().encode(body).length, text: async () => body });
    expect(result.ok).toBe(true);
  });

  it('returns safe categories for file read errors and invalid UTF-8-sized text', async () => {
    expect(await readProgressBackupFile({ size: 10, text: async () => { throw new Error('private file'); } })).toEqual({ ok: false, error: 'file-read-error' });
    expect(await readProgressBackupFile({ size: 2, text: async () => '   ' })).toEqual({ ok: false, error: 'malformed-json' });
  });
});

it('initiates downloads before revoking URLs and cleans replacement, failure and dismissal resources', async () => {
  const { downloadProgressJson, revokeProgressDownload } = await import('./progressBackupFiles');
  vi.useFakeTimers();
  const created = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second').mockReturnValueOnce('blob:failed');
  const revoked = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: created, revokeObjectURL: revoked });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(revoked).not.toHaveBeenCalledWith(this.href);
    expect(this.download).toMatch(/^meducation-progress-2026-10-13\.json$/);
  });
  try {
    expect(downloadProgressJson('{}', '2026-10-13T00:00:00.000Z')).toBeUndefined();
    expect(revoked).not.toHaveBeenCalled();
    downloadProgressJson('{}', '2026-10-13T00:00:00.000Z');
    expect(revoked).toHaveBeenCalledWith('blob:first');
    vi.advanceTimersByTime(1000);
    expect(revoked).toHaveBeenCalledWith('blob:second');
    click.mockImplementationOnce(() => { throw new Error('download denied'); });
    expect(downloadProgressJson('{}')).toContain('could not be downloaded');
    expect(revoked).toHaveBeenCalledWith('blob:failed');
  } finally {
    revokeProgressDownload(); click.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers();
  }
});
