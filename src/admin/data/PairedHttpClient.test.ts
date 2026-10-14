import { describe, expect, it, vi } from 'vitest';
import { AdminHttpError, PairedHttpClient } from './PairedHttpClient';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
describe('private paired transport', () => {
  it('keeps an uncertain receipt and makes no automatic write retry', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('lost response'))
      .mockResolvedValueOnce(ok({ result: { draftRevision: '9223372036854775806' } }));
    const client = new PairedHttpClient(fetcher);
    client.session = { authenticated: true, csrfToken: 'csrf' };
    await expect(
      client.mutate('/draft/save', { expected: { draftRevision: '9223372036854775806', publicationSequence: '4' } }),
    ).rejects.toThrow('lost response');
    const pending = client.pending!;
    await expect(client.mutate('/publish', {})).rejects.toThrow('Reconcile');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await client.reconcile()).toEqual({ committed: true, result: { draftRevision: '9223372036854775806' } });
    expect(fetcher.mock.calls[1][0]).toBe('/api/admin/operations/' + pending.operationId);
    expect(client.pending).toBeUndefined();
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.expected.draftRevision).toBe('9223372036854775806');
  });
  it('retains uncertainty through logout/expiry and clears it only after explicit not-found reconciliation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }));
    const client = new PairedHttpClient(fetcher);
    await expect(client.mutate('/publish', {})).rejects.toBeInstanceOf(AdminHttpError);
    const id = client.pending?.operationId;
    await expect(client.reconcile()).rejects.toMatchObject({ status: 401 });
    expect(client.pending?.operationId).toBe(id);
    expect(await client.reconcile()).toEqual({ committed: false });
    expect(client.pending).toBeUndefined();
  });
  it.each([401, 403, 409, 422])('does not resend rejected protected writes (%s)', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status }));
    const client = new PairedHttpClient(fetcher);
    await expect(client.mutate('/draft/save', { pair: { text: 'UNSAVED' } })).rejects.toBeInstanceOf(AdminHttpError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.pending).toBeUndefined();
    const options = fetcher.mock.calls[0][1]!;
    expect(options.credentials).toBe('same-origin');
    expect(options.cache).toBe('no-store');
  });
});

it('bounds a stalled write and preserves its uncertain receipt for reconciliation', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    )
    .mockResolvedValueOnce(ok({ result: { draftRevision: '3' } }));
  const client = new PairedHttpClient(fetcher, 10);
  await expect(client.mutate('/draft/save', {})).rejects.toMatchObject({ name: 'AbortError' });
  expect(client.inFlight).toBe(false);
  expect(client.pending).toBeDefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await client.reconcile()).committed).toBe(true);
});
