import { describe, expect, it, vi } from 'vitest';
import { AdminHttpError, PairedHttpClient, errorMessages } from './PairedHttpClient';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const failed = (status: number, error: object = {}) => new Response(JSON.stringify({ error }), { status });

describe('private editor transport', () => {
  it('sends session credentials on every call and the CSRF token and JSON body on every write', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => ok({}));
    const client = new PairedHttpClient(fetcher);
    client.session = { authenticated: true, csrfToken: 'csrf' };
    await client.get('/draft');
    await client.post('/draft/subjects', { fields: { name: 'A' } });
    await client.put('/draft/subjects/s1', { expectedVersion: 1, fields: {} });
    await client.delete('/draft/subjects/s1', { expectedVersion: 2, cascade: true });
    const calls = fetcher.mock.calls.map(([url, init]) => [init!.method, url, init!.headers, init!.body]);
    expect(calls).toEqual([
      ['GET', '/api/admin/draft', {}, undefined],
      ['POST', '/api/admin/draft/subjects', { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' }, '{"fields":{"name":"A"}}'],
      ['PUT', '/api/admin/draft/subjects/s1', { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' }, '{"expectedVersion":1,"fields":{}}'],
      ['DELETE', '/api/admin/draft/subjects/s1', { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' }, '{"expectedVersion":2,"cascade":true}'],
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init!.credentials).toBe('same-origin');
      expect(init!.cache).toBe('no-store');
    }
  });

  it.each([401, 403, 409, 422, 503])('never resends a rejected write (%s)', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(failed(status, { code: 'x' }));
    const client = new PairedHttpClient(fetcher);
    await expect(client.put('/draft/questions/i1', { expectedVersion: 1, fields: { stem: 'UNSAVED' } })).rejects.toBeInstanceOf(
      AdminHttpError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps the server error code, issues, current record and child counts for the editor', async () => {
    const issues = [{ path: '$.record.stem', code: 'blank', message: 'Stem is required.' }];
    const current = { id: 'i1', version: 4 };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(failed(422, { code: 'invalid_content', message: 'Invalid', issues }))
      .mockResolvedValueOnce(failed(409, { code: 'version_conflict', current }))
      .mockResolvedValueOnce(failed(409, { code: 'has_children', children: { quizzes: 2 } }));
    const client = new PairedHttpClient(fetcher);
    const invalid = await client.put('/x', {}).catch((e) => e);
    expect(invalid).toMatchObject({ status: 422, code: 'invalid_content', body: { issues } });
    expect(errorMessages(invalid)).toEqual([
      'The server rejected the content. Your unsaved text is kept.',
      '$.record.stem: Stem is required.',
    ]);
    const conflict = (await client.put('/x', {}).catch((e) => e)) as AdminHttpError;
    expect(conflict).toMatchObject({ status: 409, code: 'version_conflict', body: { current } });
    expect(conflict.message).toContain('changed on the server');
    expect(await client.delete('/x', {}).catch((e) => e)).toMatchObject({ code: 'has_children', body: { children: { quizzes: 2 } } });
  });

  it('bounds a stalled request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const client = new PairedHttpClient(fetcher, 10);
    await expect(client.post('/draft/publish', {})).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it('admits a whole command before its first await and releases after failure', async () => {
  const client = new PairedHttpClient(vi.fn<typeof fetch>());
  const activity: boolean[] = [];
  client.subscribe(() => activity.push(client.commandBusy));
  let finish!: () => void;
  const first = client.runCommand(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  expect(client.commandBusy).toBe(true);
  await expect(client.runCommand(async () => undefined)).rejects.toThrow('current authoring command');
  finish();
  await first;
  await expect(
    client.runCommand(async () => {
      throw new Error('Save failed');
    }),
  ).rejects.toThrow('Save failed');
  expect(client.commandBusy).toBe(false);
  expect(activity).toEqual([true, false, true, false]);
});

it('surfaces authentication requirements until a fresh session is explicitly established', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(failed(403, { code: 'fresh_auth_required' }))
    .mockResolvedValueOnce(ok({ authenticated: true, fresh: false, csrfToken: 'old' }))
    .mockResolvedValueOnce(ok({ authenticated: true, fresh: true, csrfToken: 'new' }));
  const client = new PairedHttpClient(fetcher);
  await expect(client.post('/draft/publish', {})).rejects.toBeInstanceOf(AdminHttpError);
  expect(client.authenticationRequired).toBe(true);
  await expect(client.runCommand(async () => undefined)).rejects.toThrow('Sign in');
  await client.refreshSession();
  expect(client.authenticationRequired).toBe(true);
  await client.refreshSession();
  expect(client.authenticationRequired).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
