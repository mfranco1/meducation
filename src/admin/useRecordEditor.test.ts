import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createAdminStore } from '../test/adminGateway';
import { storedFlashcardBank, storedQuestionBank } from '../test/contentFixtures';
import { useRecordEditor } from './useRecordEditor';

const open = () => createAdminStore(structuredClone(storedQuestionBank), structuredClone(storedFlashcardBank));
const requests = (store: ReturnType<typeof open>) =>
  store.fetcher.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('/api/admin', '')}`);
const setup = (options: Parameters<typeof useRecordEditor>[1] = {}) => {
  const store = open();
  const hook = renderHook(() => useRecordEditor(store, options));
  const load = async (kind: 'question' | 'subject' | 'quiz' = 'question', id = 'i1') => {
    await act(async () => {
      await hook.result.current.load({ kind, id }, store.find(kind, id)!);
    });
  };
  return { store, hook, load, result: hook.result };
};

describe('record editor', () => {
  it('saves one patch with the loaded version, adopts the returned record and uses its version next time', async () => {
    const { store, result, load } = setup();
    await load();
    const original = JSON.parse(result.current.text);
    expect(original).not.toHaveProperty('version');
    act(() => result.current.edit(JSON.stringify({ ...original, stem: 'First edit' })));
    expect(result.current.dirty).toBe(true);
    await act(async () => expect(await result.current.save()).toBe(true));
    expect(requests(store)).toEqual(['PUT /draft/questions/i1']);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedVersion: 1, fields: { stem: 'First edit' } });
    expect(JSON.parse(result.current.text)).toEqual({ ...original, stem: 'First edit' });
    expect(result.current.dirty).toBe(false);
    act(() => result.current.edit(JSON.stringify({ ...original, stem: 'Second edit' })));
    await act(async () => expect(await result.current.save()).toBe(true));
    expect(JSON.parse(store.fetcher.mock.calls[1][1]!.body as string).expectedVersion).toBe(2);
  });

  it('keeps newer text typed during a save and compares it with the committed record', async () => {
    const { store, result, load } = setup();
    await load();
    const original = result.current.text;
    const release = store.holdRequests(/questions\/i1$/);
    act(() => result.current.edit(JSON.stringify({ ...JSON.parse(original), stem: 'Captured saved value' })));
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save();
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    act(() => result.current.edit(original));
    await act(async () => {
      release();
      await saving;
    });
    expect(result.current.text).toBe(original);
    expect(result.current.dirty).toBe(true);
    expect(store.find('question', 'i1')).toMatchObject({ stem: 'Captured saved value' });
  });

  it('creates a record with an empty ID, adopts the server ID and keeps newer text during the save', async () => {
    const { store, result } = setup();
    await act(async () => {
      await result.current.loadNew('subject');
    });
    const template = JSON.parse(result.current.text);
    expect(template).toMatchObject({ id: '', name: '' });
    expect(result.current.dirty).toBe(false);
    const release = store.holdRequests(/^\/draft\/subjects$/);
    act(() => result.current.edit(JSON.stringify({ ...template, name: 'Captured new subject' })));
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save();
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    act(() => result.current.edit(JSON.stringify({ ...template, name: 'Newer exact subject $x^2$\n' })));
    await act(async () => {
      release();
      await saving;
    });
    expect(JSON.parse(result.current.text)).toEqual({ ...template, id: 's91', name: 'Newer exact subject $x^2$\n' });
    expect(result.current.selection).toMatchObject({ kind: 'subject', id: 's91' });
    expect(result.current.dirty).toBe(true);
    expect(store.snapshot.subjects.at(-1)!.name).toBe('Captured new subject');
  });

  it('shows the server issues and keeps the text when the server rejects the content', async () => {
    const { store, result, load } = setup();
    await load();
    store.rejectNext([{ path: '$.record.stem', code: 'blank', message: 'Stem is required.' }]);
    const text = JSON.stringify({ ...JSON.parse(result.current.text), stem: '' });
    act(() => result.current.edit(text));
    await act(async () => expect(await result.current.save()).toBe(false));
    expect(result.current.issues).toEqual([
      'The server rejected the content. Your unsaved text is kept.',
      '$.record.stem: Stem is required.',
    ]);
    expect(result.current.text).toBe(text);
    expect(store.find('question', 'i1')).toMatchObject({ version: 1 });
  });

  it('keeps unsaved text on a version conflict, offers the server version, and can save over it', async () => {
    const { store, result, load } = setup();
    await load();
    const original = JSON.parse(result.current.text);
    store.editElsewhere('questions', 'i1', { rationale: 'Changed elsewhere' });
    const mine = JSON.stringify({ ...original, stem: 'My edit' });
    act(() => result.current.edit(mine));
    await act(async () => expect(await result.current.save()).toBe(false));
    expect(result.current.conflict).toMatchObject({ rationale: 'Changed elsewhere', version: 2 });
    expect(result.current.text).toBe(mine);
    expect(result.current.issues).toEqual([]);
    await act(async () => result.current.keepMine());
    await act(async () => expect(await result.current.save()).toBe(true));
    // Only my own change was patched, so the other editor's rationale survives.
    expect(store.find('question', 'i1')).toMatchObject({ stem: 'My edit', rationale: 'Changed elsewhere', version: 3 });
    expect(result.current.conflict).toBeUndefined();
  });

  it('can take the server version instead of the unsaved text', async () => {
    const { store, result, load } = setup();
    await load();
    store.editElsewhere('questions', 'i1', { stem: 'Server stem' });
    act(() => result.current.edit(JSON.stringify({ ...JSON.parse(result.current.text), stem: 'Mine' })));
    await act(async () => expect(await result.current.save()).toBe(false));
    act(() => result.current.takeServerVersion());
    expect(JSON.parse(result.current.text).stem).toBe('Server stem');
    expect(result.current.dirty).toBe(false);
    expect(result.current.conflict).toBeUndefined();
  });

  it('moves a record when its parent changes and sends no patch when nothing else changed', async () => {
    const { store, result, load } = setup();
    await load();
    act(() => result.current.edit(JSON.stringify({ ...JSON.parse(result.current.text), quizId: 'q3' })));
    await act(async () => expect(await result.current.save()).toBe(true));
    expect(requests(store)).toEqual(['POST /draft/questions/i1/move', 'GET /draft']);
    expect(store.find('question', 'i1')).toMatchObject({ quizId: 'q3', version: 2 });
  });

  it('protects unsaved text before unload and cannot open another record without a decision', async () => {
    const { hook, result, load } = setup();
    await load();
    act(() => result.current.edit('Unsaved draft'));
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    act(() => {
      void result.current.select({ kind: 'quiz', id: 'q1' });
    });
    expect(result.current.text).toBe('Unsaved draft');
    expect(result.current.selection).toMatchObject({ kind: 'question', id: 'i1' });
    hook.unmount();
  });

  it('follows the server: a vanished record leaves the selection unless unsaved text is open', async () => {
    const { store, result, load } = setup({ fallback: () => ({ kind: 'subject' as const }) });
    await load();
    await act(async () => {
      await store.remove('question', [{ id: 'i1', version: 1 }]);
    });
    await waitFor(() => expect(result.current.selection).toEqual({ kind: 'subject' }));
    expect(result.current.open).toBe(false);
    await load('question', 'i3');
    act(() => result.current.edit('Unsaved text'));
    await act(async () => {
      await store.remove('question', [{ id: 'i3', version: 1 }]);
    });
    expect(result.current.selection).toMatchObject({ id: 'i3' });
    expect(result.current.text).toBe('Unsaved text');
  });

  it('reloads a clean open record when the server changes it', async () => {
    const { store, result, load } = setup();
    await load();
    await act(async () => {
      await store.update('question', 'i1', 1, { stem: 'Reverted or changed elsewhere' });
    });
    await waitFor(() => expect(JSON.parse(result.current.text).stem).toBe('Reverted or changed elsewhere'));
    expect(result.current.dirty).toBe(false);
  });
});
