import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeQuestionBank } from './runtimeQuestionBank';
import type { JsonTransport } from './contentTransport';

const subject = { id: 's1', name: 'Subject', accent: '#123456' };
const quiz = { id: 'q1', subjectId: 's1', topicId: 't1', name: 'Quiz', questionCount: 1, questionIds: ['i1'] };
const topics = [{ id: 't1', subjectId: 's1', name: 'Topic' }];
const question = {
  id: 'i1',
  quizId: 'q1',
  stem: 'Question',
  choices: [
    { id: 'A', text: 'Choice' },
    { id: 'B', text: 'Alternative' },
  ],
  answer: 'A',
  rationale: 'Reason',
  metadata: {},
};
const noRetries = { maxRetries: 0, baseDelayMs: 100, maxDelayMs: 100 };

const okJson = (body: unknown) => ({ ok: true, json: async () => body });
const summary = { ...subject, quizCount: 1, questionCount: 1, quizIds: ['q1'] };
const subjectsBody = (revision: string) => ({ revision, subjects: [summary] });
const quizzesBody = (revision: string) => ({ revision, topics, quizzes: [quiz] });

/** Seeds the bank through the transport, as the app does. Tests stub `fetch` again for what follows. */
async function seed(bank: RuntimeQuestionBank, subjectsReply: unknown, quizzesReply?: unknown) {
  const replies = vi.fn().mockResolvedValueOnce(okJson(subjectsReply));
  if (quizzesReply) replies.mockResolvedValueOnce(okJson(quizzesReply));
  vi.stubGlobal('fetch', replies);
  await bank.ensureSubjects();
  if (quizzesReply) await bank.ensureQuizzes('s1');
}

afterEach(() => vi.unstubAllGlobals());

describe('runtime question bank', () => {
  it('loads only subject summaries before a selected subject catalog', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          revision: 'rev-0',
          subjects: [{ ...subject, quizCount: 1, questionCount: 1, quizIds: ['q1'] }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-0', topics, quizzes: [quiz] }) });
    vi.stubGlobal('fetch', fetchMock);

    const bank = new RuntimeQuestionBank(noRetries);
    await bank.ensureSubjects();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/subjects');
    expect(bank.listQuizzes('s1')).toEqual([]);
    const selected = await bank.ensureQuizzes('s1');
    expect(selected).toEqual([quiz]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/subjects/s1/quizzes?revision=rev-0');
  });

  it('loads quiz questions lazily, hydrates sparse metadata, and caches the result', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    await seed(bank, subjectsBody('rev-1'), quizzesBody('rev-1'));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ revision: 'rev-1', questions: [{ ...question, metadata: undefined }] }));
    vi.stubGlobal('fetch', fetchMock);

    expect(bank.listSubjects()).toEqual([summary]);
    expect(bank.listQuizzes('s1')).toEqual([quiz]);
    expect(bank.listQuestions('q1')).toEqual([]);
    const result = await bank.ensureQuestions('q1');
    expect(result[0].metadata).toEqual({});
    expect(bank.listQuestions('q1')).toEqual(result);
    await bank.ensureQuestions('q1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('revision=rev-1');
  });

  it('rejects a question response from a different bank revision', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    await seed(bank, subjectsBody('rev-1'), quizzesBody('rev-1'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ revision: 'rev-2', questions: [question] })));
    await expect(bank.ensureQuestions('q1')).rejects.toMatchObject({ kind: 'revision' });
    expect(bank.listQuestions('q1')).toEqual([]);
  });

  it('loads only the selected subject catalog and deduplicates requests', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    await seed(bank, subjectsBody('rev-3'));
    const fetchMock = vi.fn().mockResolvedValue(okJson(quizzesBody('rev-3')));
    vi.stubGlobal('fetch', fetchMock);

    expect(bank.listSubjectSummaries()[0].quizIds).toEqual(['q1']);
    const [first, second] = await Promise.all([bank.ensureQuizzes('s1'), bank.ensureQuizzes('s1')]);
    expect(first).toEqual([quiz]);
    expect(second).toEqual([quiz]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bank.getQuizState('s1')).toBe('ready');
  });

  it('rejects a subject response without quiz membership instead of waiting for a subject click', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-4', subjects: [subject] }) }),
    );
    await expect(bank.ensureSubjects()).rejects.toMatchObject({ kind: 'invalid' });
    expect(bank.getCatalogState()).toBe('error');
    expect(bank.listSubjects()).toEqual([]);
  });

  const hang = () => new Promise(() => undefined);
  const timeoutCases = [
    {
      name: 'subject',
      hang,
      setup: async () => undefined,
      recovered: okJson(subjectsBody('rev-t')),
      load: (bank: RuntimeQuestionBank) => bank.ensureSubjects(),
      expectRecovered: (bank: RuntimeQuestionBank) => expect(bank.getCatalogState()).toBe('ready'),
      expectFailed: (bank: RuntimeQuestionBank) => expect(bank.getCatalogState()).toBe('error'),
    },
    {
      name: 'quiz',
      hang,
      setup: (bank: RuntimeQuestionBank) => seed(bank, subjectsBody('rev-t')),
      recovered: okJson(quizzesBody('rev-t')),
      load: (bank: RuntimeQuestionBank) => bank.ensureQuizzes('s1'),
      expectRecovered: (bank: RuntimeQuestionBank) => expect(bank.getQuizState('s1')).toBe('ready'),
      expectFailed: (bank: RuntimeQuestionBank) => expect(bank.getQuizState('s1')).toBe('error'),
    },
    {
      name: 'question',
      hang,
      setup: (bank: RuntimeQuestionBank) => seed(bank, subjectsBody('rev-t'), quizzesBody('rev-t')),
      recovered: okJson({ revision: 'rev-t', questions: [{ ...question, metadata: undefined }] }),
      load: (bank: RuntimeQuestionBank) => bank.ensureQuestions('q1'),
      expectRecovered: (bank: RuntimeQuestionBank) => expect(bank.listQuestions('q1')).toHaveLength(1),
      expectFailed: (bank: RuntimeQuestionBank) => expect(bank.listQuestions('q1')).toEqual([]),
    },
  ];

  it.each(timeoutCases)('times out $name loading, releases its loading state and retries', async (c) => {
    const bank = new RuntimeQuestionBank(noRetries);
    await c.setup(bank);
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(c.hang).mockResolvedValueOnce(c.recovered));
    vi.useFakeTimers();
    try {
      const pending = expect(c.load(bank)).rejects.toMatchObject({ kind: 'timeout' });
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;
      c.expectFailed(bank);
      await c.load(bank);
      c.expectRecovered(bank);
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out while reading an unfinished response body', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: hang }));
    vi.useFakeTimers();
    try {
      const pending = expect(bank.ensureSubjects()).rejects.toMatchObject({ kind: 'timeout' });
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;
      expect(bank.getCatalogState()).toBe('error');
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a malformed quiz response as recoverable content failure', async () => {
    const bank = new RuntimeQuestionBank();
    await seed(bank, subjectsBody('rev-8'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson({ topics, quizzes: [quiz] })));
    await expect(bank.ensureQuizzes('s1')).rejects.toMatchObject({ kind: 'invalid' });
    expect(bank.getQuizState('s1')).toBe('error');
  });

  it('shares a single automatic retry chain when callers request subjects during backoff', async () => {
    const bank = new RuntimeQuestionBank({ maxRetries: 1, baseDelayMs: 100, maxDelayMs: 500 }, () => 0);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          revision: 'rev-dedupe',
          subjects: [{ ...subject, quizCount: 1, questionCount: 1, quizIds: ['q1'] }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const first = bank.ensureSubjects();
      await vi.advanceTimersByTimeAsync(0);
      const second = bank.ensureSubjects();
      await vi.advanceTimersByTimeAsync(50);
      await expect(first).resolves.toHaveLength(1);
      await expect(second).resolves.toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can advance a catalog backoff without creating a second request chain', async () => {
    const bank = new RuntimeQuestionBank({ maxRetries: 1, baseDelayMs: 10_000, maxDelayMs: 10_000 }, () => 0);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          revision: 'rev-now',
          subjects: [{ ...subject, quizCount: 1, questionCount: 1, quizIds: ['q1'] }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const pending = bank.ensureSubjects();
      await vi.waitFor(() => expect(bank.getCatalogState()).toBe('retrying'));
      expect(bank.getCatalogRetryAt()).toBeDefined();
      expect(bank.retryCatalogNow()).toBe(true);
      await expect(pending).resolves.toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(bank.getCatalogState()).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks independent subject retries and can advance only one pending catalog', async () => {
    const secondSubject = { id: 's2', name: 'Second', accent: '#654321' };
    const bank = new RuntimeQuestionBank({ maxRetries: 1, baseDelayMs: 10_000, maxDelayMs: 10_000 }, () => 0);
    await seed(bank, {
      revision: 'rev-subjects',
      subjects: [summary, { ...secondSubject, quizCount: 1, questionCount: 1, quizIds: ['q2'] }],
    });
    const response = (id: string, subjectId: string, questionId: string) => ({
      ok: true,
      json: async () => ({
        revision: 'rev-subjects',
        topics: [{ id: `t${subjectId.slice(1)}`, subjectId, name: 'Topic' }],
        quizzes: [
          {
            id,
            subjectId,
            topicId: `t${subjectId.slice(1)}`,
            name: 'Quiz',
            questionCount: 1,
            questionIds: [questionId],
          },
        ],
      }),
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(response('q1', 's1', 'i1'))
      .mockResolvedValueOnce(response('q2', 's2', 'i2'));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const first = bank.ensureQuizzes('s1');
      const second = bank.ensureQuizzes('s2');
      await vi.waitFor(() => {
        expect(bank.getQuizRecovery('s1').retrying).toBe(true);
        expect(bank.getQuizRecovery('s2').retrying).toBe(true);
      });
      expect(bank.getQuizRecovery('s1').retryAt).toBeDefined();
      expect(bank.getQuizRecovery('s2').retryAt).toBeDefined();
      expect(bank.retryQuizNow('s1')).toBe(true);
      await expect(first).resolves.toHaveLength(1);
      expect(bank.getQuizState('s1')).toBe('ready');
      expect(bank.getQuizRecovery('s1').failed).toBe(false);
      expect(bank.getQuizState('s2')).toBe('retrying');
      expect(bank.getQuizRecovery('s2').failed).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(bank.retryQuizNow('s2')).toBe(true);
      await expect(second).resolves.toHaveLength(1);
      expect(bank.getQuizState('s2')).toBe('ready');
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops after the configured retry budget and allows a fresh manual operation', async () => {
    const bank = new RuntimeQuestionBank({ maxRetries: 1, baseDelayMs: 100, maxDelayMs: 500 }, () => 0);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          revision: 'rev-manual',
          subjects: [{ ...subject, quizCount: 1, questionCount: 1, quizIds: ['q1'] }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const pending = expect(bank.ensureSubjects()).rejects.toMatchObject({ kind: 'network' });
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(bank.getCatalogState()).toBe('error');
      await bank.ensureSubjects();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(bank.getCatalogState()).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a question retry during backoff without starting another attempt', async () => {
    const bank = new RuntimeQuestionBank({ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 4000 }, () => 0);
    await seed(bank, subjectsBody('rev-cancel'), quizzesBody('rev-cancel'));
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const request = bank.ensureQuestions('q1');
      const cancelled = expect(request).rejects.toMatchObject({ kind: 'cancelled' });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      bank.cancelQuestionLoad('q1');
      await cancelled;
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(bank.listQuestions('q1')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('quiz launch freshness', () => {
  it('checks every cached launch, blocks changed/deleted/moved content and outages, preserving study arrays', async () => {
    const subjects = [summary];
    const transport = { get: vi.fn().mockResolvedValue({ revision: 'rev-1', subjects }) };
    const bank = new RuntimeQuestionBank(noRetries, () => 0, transport);
    await bank.ensureSubjects();
    transport.get.mockResolvedValueOnce(quizzesBody('rev-1'));
    await bank.ensureQuizzes('s1');
    transport.get.mockClear();
    transport.get.mockResolvedValueOnce({ revision: 'rev-1', questions: [{ ...question, metadata: undefined }] });
    const active = await bank.ensureQuestions(quiz.id);
    (await bank.validateLaunch(quiz))();
    (await bank.validateLaunch(quiz))();
    expect(transport.get).toHaveBeenCalledTimes(3);
    await bank.ensureQuestions(quiz.id);
    expect(transport.get).toHaveBeenCalledTimes(3);
    transport.get.mockResolvedValueOnce({ revision: 'rev-2', subjects });
    await expect(bank.validateLaunch(quiz)).rejects.toMatchObject({ kind: 'revision' });
    transport.get.mockResolvedValueOnce({ revision: 'rev-1', subjects: [] });
    await expect(bank.validateLaunch(quiz)).rejects.toMatchObject({ kind: 'revision' });
    transport.get.mockRejectedValueOnce(new Error('offline'));
    await expect(bank.validateLaunch(quiz)).rejects.toThrow('offline');
    expect(bank.listQuestions(quiz.id)).toBe(active);
    (await bank.validateLaunch(quiz))();
  });
});

describe('generated tests', () => {
  const second = { id: 's2', name: 'Second', accent: '#222222' };
  const pool = (subjectId: string, quizId: string, first: number, count: number) => {
    const questionIds = Array.from({ length: count }, (_, index) => `i${first + index}`);
    return {
      quizzes: [
        { id: quizId, subjectId, topicId: `t${subjectId.slice(1)}`, name: 'Quiz', questionCount: count, questionIds },
      ],
      topics: [{ id: `t${subjectId.slice(1)}`, subjectId, name: 'Topic' }],
    };
  };
  const one = pool('s1', 'q1', 1, 150);
  const two = pool('s2', 'q2', 1001, 5);
  const subjects = [subject, second].map((entry, index) => ({
    ...entry,
    quizCount: 1,
    questionCount: [150, 5][index],
    quizIds: [['q1', 'q2'][index]],
  }));
  const byId = (url: string) => {
    const ids = new URL(url, 'http://x.test').searchParams.get('ids')!.split(',');
    return ids.map((id) => ({
      ...question,
      metadata: undefined,
      id,
      quizId: one.quizzes[0].questionIds.includes(id) ? 'q1' : 'q2',
    }));
  };
  const setup = () => {
    const transport = {
      get: vi.fn(async (path: string): Promise<unknown> => {
        if (path.startsWith('/api/v1/subjects/s1/quizzes')) return { revision: 'rev', ...one };
        if (path.startsWith('/api/v1/subjects/s2/quizzes')) return { revision: 'rev', ...two };
        if (path.startsWith('/api/v1/subjects')) return { revision: 'rev', subjects };
        return { revision: 'rev', questions: byId(path) };
      }),
    };
    const bank = new RuntimeQuestionBank(noRetries, () => 0.5, transport as unknown as JsonTransport);
    return { bank, transport };
  };
  const requests = (transport: { get: ReturnType<typeof vi.fn> }) =>
    transport.get.mock.calls.map(([path]) => path as string).filter((path) => path.startsWith('/api/v1/questions'));

  it('loads a Subject Test from one subject and caches its questions', async () => {
    const { bank, transport } = setup();
    await bank.ensureSubjects();
    const ids = await bank.ensureTestQuestions({ ...quiz, id: 'subject-test:s1', questionCount: 100 });
    expect(ids).toHaveLength(100);
    expect(ids.every((id) => one.quizzes[0].questionIds.includes(id))).toBe(true);
    expect(bank.listQuestionsById(ids).map((item) => item.id)).toEqual(ids);
    expect(transport.get.mock.calls.some(([path]) => String(path).includes('/subjects/s2/'))).toBe(false);
  });

  it('loads every subject catalog for a Mixed Test and keeps only given IDs still in the catalog', async () => {
    const { bank } = setup();
    const mixed = { ...quiz, id: 'mixed-test', subjectId: 'mixed-test', questionCount: 300 };
    const ids = await bank.ensureTestQuestions(mixed);
    expect(bank.listQuizzes('s1')).toHaveLength(1);
    expect(bank.listQuizzes('s2')).toHaveLength(1);
    expect(ids).toHaveLength(155);
    expect(await bank.ensureTestQuestions(mixed, ['i1', 'i9999', 'i1002'])).toEqual(['i1', 'i1002']);
  });

  it('requests only IDs that are not cached', async () => {
    const { bank, transport } = setup();
    await bank.ensureSubjects();
    await bank.ensureQuizzes('s1');
    await bank.ensureQuestionsById(['i1', 'i2']);
    const loaded = await bank.ensureQuestionsById(['i3', 'i1', 'i2']);
    expect(loaded.map((item) => item.id)).toEqual(['i3', 'i1', 'i2']);
    const calls = requests(transport);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe('/api/v1/questions?ids=i3&revision=rev');
  });

  it.each([
    ['out of order', (list: { id: string; quizId: string }[]) => list.reverse()],
    ['unknown', (list: { id: string; quizId: string }[]) => [...list, { ...list[0], id: 'i999' }]],
    ['in the wrong quiz', (list: { id: string; quizId: string }[]) => list.map((item) => ({ ...item, quizId: 'q2' }))],
  ])('rejects a by-ID response with a question %s', async (_name, change) => {
    const { bank, transport } = setup();
    await bank.ensureQuizzes('s1');
    transport.get.mockImplementationOnce(async (path: string) => ({
      revision: 'rev',
      questions: change(byId(path)),
    }));
    await expect(bank.ensureQuestionsById(['i1', 'i2'])).rejects.toMatchObject({ kind: 'invalid' });
    expect(bank.listQuestionsById(['i1', 'i2'])).toEqual([]);
  });

  it('admits generated tests at launch and blocks them after a revision change', async () => {
    const { bank, transport } = setup();
    await bank.ensureSubjects();
    (await bank.validateLaunch({ id: 'subject-test:s1', subjectId: 's1' }))();
    (await bank.validateLaunch({ id: 'mixed-test', subjectId: 'mixed-test' }))();
    transport.get.mockResolvedValueOnce({ revision: 'rev-2', subjects });
    await expect(bank.validateLaunch({ id: 'mixed-test', subjectId: 'mixed-test' })).rejects.toMatchObject({
      kind: 'revision',
    });
    transport.get.mockResolvedValueOnce({ revision: 'rev', subjects: [subjects[1]] });
    await expect(bank.validateLaunch({ id: 'subject-test:s1', subjectId: 's1' })).rejects.toMatchObject({
      kind: 'revision',
    });
  });
});
