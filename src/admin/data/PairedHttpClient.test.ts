import { describe, expect, it, vi } from 'vitest';
import { AdminHttpError, PairedHttpClient, workspaceStatus } from './PairedHttpClient';

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
      throw new Error('Preview failed');
    }),
  ).rejects.toThrow('Preview failed');
  expect(client.commandBusy).toBe(false);
  expect(activity).toEqual([true, false, true, false]);
});

it('surfaces authentication requirements until a fresh session is explicitly established', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{}', { status: 403 }))
    .mockResolvedValueOnce(ok({ authenticated: true, fresh: false, csrfToken: 'old' }))
    .mockResolvedValueOnce(ok({ authenticated: true, fresh: true, csrfToken: 'new' }));
  const client = new PairedHttpClient(fetcher);
  await expect(client.post('/publish/preview', {})).rejects.toBeInstanceOf(AdminHttpError);
  expect(client.authenticationRequired).toBe(true);
  await expect(client.runCommand(async () => undefined)).rejects.toThrow('Sign in');
  await client.refreshSession();
  expect(client.authenticationRequired).toBe(true);
  await client.refreshSession();
  expect(client.authenticationRequired).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
});


const statusSnapshot = {
  draft: { basePublicationSequence: '2', digests: { quizRevision: 'q2', flashcardRevision: 'f2' } },
  publication: { sequence: '2', digests: { quizRevision: 'q2', flashcardRevision: 'f2' } },
};
const clean = { quizzes: false, flashcards: false };
describe('workspace status', () => {
  it('distinguishes unsaved text, saved draft and publication independently', () => {
    expect(workspaceStatus(statusSnapshot, clean, false)).toMatchObject({ label: 'Up to date', draftChanged: false });
    const changed = {
      ...statusSnapshot,
      draft: { ...statusSnapshot.draft, digests: { quizRevision: 'q3', flashcardRevision: 'f2' } },
    };
    expect(workspaceStatus(changed, clean, false)).toMatchObject({ label: 'Draft changes', publishBlocked: '' });
    expect(workspaceStatus(changed, { quizzes: false, flashcards: true }, false)).toMatchObject({
      label: 'Unsaved edits',
      draftChanged: true,
    });
    expect(workspaceStatus(changed, { quizzes: true, flashcards: true }, false).publishBlocked).toContain(
      'Quizzes and Flashcards',
    );
    expect(workspaceStatus(changed, { quizzes: true, flashcards: true }, true).label).toBe('Check save status');
  });
  it('blocks publication for stale bases and unchanged drafts, and permits an initial release', () => {
    expect(workspaceStatus(statusSnapshot, clean, false).publishBlocked).toContain('no saved draft changes');
    expect(
      workspaceStatus({ ...statusSnapshot, publication: { ...statusSnapshot.publication, sequence: '3' } }, clean, false)
        .publishBlocked,
    ).toContain('Reset');
    expect(
      workspaceStatus({ ...statusSnapshot, publication: { sequence: '2', digests: null } }, clean, false).publishBlocked,
    ).toBe('');
  });
});
