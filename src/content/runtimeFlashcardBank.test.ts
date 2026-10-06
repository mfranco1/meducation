import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeFlashcardBank } from './runtimeFlashcardBank';
import type { JsonTransport } from './contentTransport';

const subjects = [{ id: 's1', name: 'Subject', accent: '#123456', topicCount: 1, deckCount: 1, deckIds: ['d-neuro'] }];
const catalog = {
  revision: 'rev-1',
  topics: [{ id: 't-neuro', subjectId: 's1', name: 'Neuro', deckCount: 1 }],
  decks: [{ id: 'd-neuro', topicId: 't-neuro', name: 'Neuro basics', cardCount: 1, cardIds: ['f-1'] }],
};
const cards = { revision: 'rev-1', cards: [{ id: 'f-1', deckId: 'd-neuro', front: 'Front', back: 'Back' }] };
const noRetries = { maxRetries: 0, baseDelayMs: 100, maxDelayMs: 100 };

afterEach(() => vi.unstubAllGlobals());

describe('runtime flashcard bank', () => {
  it('rejects a same-count catalog with substituted deck identities', async () => {
    const transport = { get: vi.fn().mockResolvedValueOnce({ revision: 'rev-1', subjects }).mockResolvedValueOnce({ ...catalog, decks: [{ ...catalog.decks[0], id: 'd-other' }] }) };
    const bank = new RuntimeFlashcardBank(noRetries, transport);
    await bank.ensureSubjects();
    await expect(bank.ensureSubjectCatalog('s1')).rejects.toMatchObject({ kind: 'invalid' });
    expect(bank.getDeck('d-other')).toBeUndefined();
  });

  it('ignores an aborted transport failure after a replacement request succeeds', async () => {
    let rejectFirst!: (reason: Error) => void;
    const transport = { get: vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; })).mockResolvedValueOnce({ revision: 'rev-1', subjects }) };
    const bank = new RuntimeFlashcardBank(noRetries, transport);
    const first = bank.ensureSubjects();
    const rejection = expect(first).rejects.toThrow('Aborted');
    bank.cancel('subjects');
    await bank.ensureSubjects();
    rejectFirst(new Error('Aborted'));
    await rejection;
    expect(bank.getState('subjects')).toBe('ready');
    expect(bank.getError('subjects')).toBeUndefined();
  });
  it('loads shared subjects first, then the selected catalog and cards on demand', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-1', subjects }) })
      .mockResolvedValueOnce({ ok: true, json: async () => catalog })
      .mockResolvedValueOnce({ ok: true, json: async () => cards });
    vi.stubGlobal('fetch', fetchMock);
    const bank = new RuntimeFlashcardBank(noRetries);

    await bank.ensureSubjects();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [first, second] = await Promise.all([bank.ensureSubjectCatalog('s1'), bank.ensureSubjectCatalog('s1')]);
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bank.listCards('d-neuro')).toEqual([]);
    await bank.ensureCards('d-neuro');
    expect(bank.listCards('d-neuro')).toEqual(cards.cards);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/v1/flashcards/subjects/s1/catalog?revision=rev-1');
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/v1/flashcards/decks/d-neuro/cards?revision=rev-1');
  });

  it('rejects catalog revision changes and mismatched card membership or order', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-1', subjects }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...catalog, revision: 'rev-2' }) });
    vi.stubGlobal('fetch', fetchMock);
    const bank = new RuntimeFlashcardBank(noRetries);
    await bank.ensureSubjects();
    await expect(bank.ensureSubjectCatalog('s1')).rejects.toMatchObject({ kind: 'revision' });

    const wrongCards = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-1', subjects }) })
      .mockResolvedValueOnce({ ok: true, json: async () => catalog })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...cards, cards: [{ ...cards.cards[0], id: 'f-other' }] }) });
    vi.stubGlobal('fetch', wrongCards);
    const second = new RuntimeFlashcardBank(noRetries);
    await second.ensureSubjects();
    await second.ensureSubjectCatalog('s1');
    await expect(second.ensureCards('d-neuro')).rejects.toMatchObject({ kind: 'invalid' });
    expect(second.listCards('d-neuro')).toEqual([]);
  });

  it('aborts selected-resource requests and does not cache a stale response', async () => {
    let resolveResponse!: (value: unknown) => void;
    const transport: JsonTransport = {
      get<T>(_path: string, options?: Parameters<JsonTransport['get']>[1]): Promise<T> {
        return new Promise(resolve => {
        resolveResponse = value => resolve(value as T);
        options?.signal?.addEventListener('abort', () => resolve({ revision: 'rev-1', subjects } as T));
        });
      },
    };
    const bank = new RuntimeFlashcardBank(noRetries, transport);
    const request = bank.ensureSubjects();
    bank.cancel('subjects');
    resolveResponse({ revision: 'rev-1', subjects });
    await expect(request).rejects.toMatchObject({ kind: 'cancelled' });
    expect(bank.listSubjects()).toEqual([]);
    expect(bank.getState('subjects')).toBe('idle');
  });
});
