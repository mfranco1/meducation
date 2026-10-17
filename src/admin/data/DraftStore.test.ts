import { describe, expect, it } from 'vitest';
import { createAdminStore } from '../../test/adminGateway';
import { emptyFlashcardBank, storedFlashcardBank, storedQuestionBank } from '../../test/contentFixtures';
import { AdminHttpError } from './PairedHttpClient';
import { BulkFailure } from './DraftStore';

const open = () => createAdminStore(structuredClone(storedQuestionBank), structuredClone(storedFlashcardBank));
const calls = (store: ReturnType<typeof open>) =>
  store.fetcher.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('/api/admin', '')}`);

describe('draft store record calls', () => {
  it('sends one patch for an edit, replaces the local copy from the response and does not refetch', async () => {
    const store = open();
    const record = await store.update('question', 'i1', 1, { stem: 'New stem', answerNote: null });
    expect(record).toMatchObject({ id: 'i1', stem: 'New stem', version: 2 });
    expect(store.find('question', 'i1')).toBe(record);
    expect(store.snapshot.changed).toBe(true);
    expect(calls(store)).toEqual(['PUT /draft/questions/i1']);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({
      expectedVersion: 1,
      fields: { stem: 'New stem', answerNote: null },
    });
  });

  it('keeps the server record on a version conflict and refuses to overwrite', async () => {
    const store = open();
    store.editElsewhere('questions', 'i1', { stem: 'Changed by someone else' });
    const error = await store.update('question', 'i1', 1, { stem: 'Mine' }).catch((e) => e);
    expect(error).toBeInstanceOf(AdminHttpError);
    expect(error).toMatchObject({ code: 'version_conflict', body: { current: { stem: 'Changed by someone else', version: 2 } } });
    expect(store.find('question', 'i1')).toMatchObject({ stem: 'Changed by someone else', version: 2 });
  });

  it('creates with a server-assigned ID and reloads so order and flags match the server', async () => {
    const store = open();
    const created = await store.create('question', 'q1', {
      stem: 'S',
      choices: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }],
      rationale: 'R',
    });
    expect(created.id).toBe('i91');
    expect(calls(store)).toEqual(['POST /draft/questions', 'GET /draft']);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toMatchObject({ parentId: 'q1' });
    expect(store.snapshot.questions.map((row) => row.id)).toEqual(['i1', 'i3', 'i91', 'i2', 'i4']);
  });

  it('moves one place using the move route and the current version', async () => {
    const store = open();
    await store.move('question', 'i3', 1, { afterId: null });
    expect(store.snapshot.questions.map((row) => row.id)).toEqual(['i3', 'i1', 'i2', 'i4']);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedVersion: 1, afterId: null });
  });

  it('deletes with cascade and each record version, then reloads', async () => {
    const store = open();
    await store.remove('subject', [{ id: 's1', version: 1 }]);
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedVersion: 1, cascade: true });
    expect(store.snapshot.subjects.map((row) => row.id)).toEqual(['s2']);
    expect(store.snapshot.quizzes.map((row) => row.id)).toEqual(['q2']);
    expect(store.snapshot.decks).toEqual([]);
    expect(store.snapshot.cards).toEqual([]);
  });

  it('adds a subject, its quizzes and their questions with one request per step and no ID handling', async () => {
    const store = createAdminStore(structuredClone(storedQuestionBank), structuredClone(emptyFlashcardBank));
    const item = { stem: 'S', choices: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], answer: 'A', rationale: 'R' };
    const result = await store.addTree({
      subject: { name: 'New subject', accent: '#bc531e' },
      groups: [
        { create: { kind: 'quizzes', fields: { name: 'Quiz one' } }, childKind: 'questions', children: [item, item] },
        { create: { kind: 'quizzes', fields: { name: 'Quiz two' } }, childKind: 'questions', children: [item] },
      ],
    });
    expect(result).toEqual({ subjectId: 's91', parentIds: ['q91', 'q92'], created: 3 });
    expect(calls(store)).toEqual([
      'POST /draft/subjects',
      'POST /draft/quizzes',
      'POST /draft/quizzes/q91/questions/bulk',
      'POST /draft/quizzes',
      'POST /draft/quizzes/q92/questions/bulk',
      'GET /draft',
    ]);
    expect(store.snapshot.quizzes.at(-1)).toMatchObject({ id: 'q92', subjectId: 's91', name: 'Quiz two' });
    expect(store.snapshot.questions.filter((row) => row.quizId === 'q91')).toHaveLength(2);
  });

  it('reports what was already saved when a later step fails', async () => {
    const store = open();
    const item = { stem: '', choices: [], rationale: '' };
    store.rejectNext([{ path: '$.records[0].stem', code: 'blank', message: 'Stem is required.' }], /\/bulk$/);
    const failure = await store
      .addTree({
        subjectId: 's1',
        groups: [{ create: { kind: 'quizzes', fields: { name: 'Q' } }, childKind: 'questions', children: [item] }],
      })
      .catch((e) => e);
    expect(failure).toBeInstanceOf(BulkFailure);
    expect(failure.message).toContain('Already saved');
    expect(failure.message).toContain('$.records[0].stem: Stem is required.');
    // The quiz was created before the failing bulk step and stays in the draft (reloaded from the server).
    expect(store.snapshot.quizzes.some((row) => row.name === 'Q')).toBe(true);
  });

  it('reverts a change using the record version, discards and publishes', async () => {
    const store = open();
    await store.update('card', 'f-1', 1, { front: 'Edited' });
    expect(store.snapshot.changed).toBe(true);
    const [change] = (await store.changes(0)).changes;
    await store.revert(change);
    expect(store.find('card', 'f-1')).toMatchObject({ front: storedFlashcardBank.cards[0].front, version: 3 });
    expect(JSON.parse(store.fetcher.mock.calls.at(-2)![1]!.body as string)).toEqual({ expectedVersion: 2 });
    await store.update('card', 'f-1', 3, { front: 'Edited again' });
    await store.discard();
    expect(store.snapshot.changed).toBe(false);
    expect(store.find('card', 'f-1')).toMatchObject({ front: storedFlashcardBank.cards[0].front, version: 1 });
    expect(await store.publish()).toEqual({ published: false, releaseId: 'release-1', publicationSequence: 1 });
    await store.update('card', 'f-1', 1, { front: 'Publish me' });
    expect(await store.publish()).toMatchObject({ published: true, publicationSequence: 2 });
    expect(store.snapshot.changed).toBe(false);
  });

  it('activates a release against the loaded publication sequence', async () => {
    const store = open();
    await store.activate('release-1');
    expect(JSON.parse(store.fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedPublicationSequence: 1 });
  });

  it('serializes commands: a second write is refused while one is in flight', async () => {
    const store = open();
    const release = store.holdRequests(/^\/draft\/questions\/i1$/);
    const first = store.update('question', 'i1', 1, { stem: 'A' });
    await expect(store.update('question', 'i3', 1, { stem: 'B' })).rejects.toThrow('current authoring command');
    release();
    await first;
    expect(calls(store)).toEqual(['PUT /draft/questions/i1']);
  });
});
