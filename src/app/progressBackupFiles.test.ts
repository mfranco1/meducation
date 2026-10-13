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
