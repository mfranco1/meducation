import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeQuestionBank, runtimeQuestionBank } from './runtimeQuestionBank';
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

afterEach(() => vi.unstubAllGlobals());

describe('runtime question bank', () => {
  it('loads only subject summaries before a selected subject catalog', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ revision: 'rev-0', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-0', topics, quizzes: [quiz] }) });
    vi.stubGlobal('fetch', fetchMock);

    await runtimeQuestionBank.ensureSubjects();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/subjects');
    expect(runtimeQuestionBank.listQuizzes('s1')).toEqual([]);
    const selected = await runtimeQuestionBank.ensureQuizzes('s1');
    expect(selected).toEqual([quiz]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/subjects/s1/quizzes?revision=rev-0');
  });

  it('loads quiz questions lazily, hydrates sparse metadata, and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ revision: 'rev-1', questions: [{ ...question, metadata: undefined }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    runtimeQuestionBank.configureApi({ revision: 'rev-1', subjects: [subject] }, [
      { revision: 'rev-1', topics, quizzes: [quiz] },
    ]);

    expect(runtimeQuestionBank.listSubjects()).toEqual([subject]);
    expect(runtimeQuestionBank.listQuizzes('s1')).toEqual([quiz]);
    expect(runtimeQuestionBank.listQuestions('q1')).toEqual([]);
    const result = await runtimeQuestionBank.ensureQuestions('q1');
    expect(result[0].metadata).toEqual({});
    expect(runtimeQuestionBank.listQuestions('q1')).toEqual(result);
    await runtimeQuestionBank.ensureQuestions('q1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('revision=rev-1');
  });

  it('rejects a question response from a different bank revision', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ revision: 'rev-2', questions: [question] }),
      }),
    );
    runtimeQuestionBank.configureApi({ revision: 'rev-1', subjects: [subject] }, [
      { revision: 'rev-1', topics, quizzes: [quiz] },
    ]);
    await expect(runtimeQuestionBank.ensureQuestions('q1')).rejects.toMatchObject({ kind: 'revision' });
    expect(runtimeQuestionBank.listQuestions('q1')).toEqual([]);
  });

  it('loads only the selected subject catalog and deduplicates requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-3', topics, quizzes: [quiz] }) });
    vi.stubGlobal('fetch', fetchMock);
    runtimeQuestionBank.configureApi({ revision: 'rev-3', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] });

    expect(runtimeQuestionBank.listSubjectSummaries()[0].quizIds).toEqual(['q1']);
    const [first, second] = await Promise.all([
      runtimeQuestionBank.ensureQuizzes('s1'),
      runtimeQuestionBank.ensureQuizzes('s1'),
    ]);
    expect(first).toEqual([quiz]);
    expect(second).toEqual([quiz]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runtimeQuestionBank.getQuizState('s1')).toBe('ready');
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

  const subjectsBody = (revision: string) => ({
    revision,
    subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }],
  });
  const okJson = (body: unknown) => ({ ok: true, json: async () => body });
  const hang = () => new Promise(() => undefined);
  const timeoutCases = [
    {
      name: 'subject',
      hang,
      setup: () => undefined,
      recovered: okJson(subjectsBody('rev-t')),
      load: (bank: RuntimeQuestionBank) => bank.ensureSubjects(),
      expectRecovered: (bank: RuntimeQuestionBank) => expect(bank.getCatalogState()).toBe('ready'),
      expectFailed: (bank: RuntimeQuestionBank) => expect(bank.getCatalogState()).toBe('error'),
    },
    {
      name: 'quiz',
      hang,
      setup: (bank: RuntimeQuestionBank) =>
        bank.configureApi({ revision: 'rev-t', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }),
      recovered: okJson({ revision: 'rev-t', topics, quizzes: [quiz] }),
      load: (bank: RuntimeQuestionBank) => bank.ensureQuizzes('s1'),
      expectRecovered: (bank: RuntimeQuestionBank) => expect(bank.getQuizState('s1')).toBe('ready'),
      expectFailed: (bank: RuntimeQuestionBank) => expect(bank.getQuizState('s1')).toBe('error'),
    },
    {
      name: 'question',
      hang,
      setup: (bank: RuntimeQuestionBank) =>
        bank.configureApi({ revision: 'rev-t', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }, [
          { revision: 'rev-t', topics, quizzes: [quiz] },
        ]),
      recovered: okJson({ revision: 'rev-t', questions: [{ ...question, metadata: undefined }] }),
      load: (bank: RuntimeQuestionBank) => bank.ensureQuestions('q1'),
      expectRecovered: (bank: RuntimeQuestionBank) => expect(bank.listQuestions('q1')).toHaveLength(1),
      expectFailed: (bank: RuntimeQuestionBank) => expect(bank.listQuestions('q1')).toEqual([]),
    },
  ];

  it.each(timeoutCases)('times out $name loading, releases its loading state and retries', async (c) => {
    const bank = new RuntimeQuestionBank(noRetries);
    c.setup(bank);
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
    bank.configureApi({ revision: 'rev-8', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ topics, quizzes: [quiz] }) }));
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
        json: async () => ({ revision: 'rev-dedupe', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }),
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
        json: async () => ({ revision: 'rev-now', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }),
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
    bank.configureApi({
      revision: 'rev-subjects',
      subjects: [
        { ...subject, quizCount: 1, quizIds: ['q1'] },
        { ...secondSubject, quizCount: 1, quizIds: ['q2'] },
      ],
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
        json: async () => ({ revision: 'rev-manual', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }),
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
    bank.configureApi({ revision: 'rev-cancel', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }, [
      { revision: 'rev-cancel', topics, quizzes: [quiz] },
    ]);
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

  it.each([
    {
      name: 'subject response',
      seed: () => undefined,
      start: (bank: RuntimeQuestionBank) => bank.ensureSubjects(),
      late: { revision: 'old', subjects: [{ ...subject, quizCount: 0, quizIds: [] }] },
      expectCurrent: (bank: RuntimeQuestionBank) => expect(bank.getCatalogState()).toBe('ready'),
    },
    {
      name: 'quiz catalog',
      seed: (bank: RuntimeQuestionBank) =>
        bank.configureApi({ revision: 'old', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }),
      start: (bank: RuntimeQuestionBank) => bank.ensureQuizzes('s1'),
      late: { revision: 'old', topics, quizzes: [{ ...quiz, id: 'stale' }] },
      expectCurrent: (bank: RuntimeQuestionBank) => expect(bank.listQuizzes('s1')).toEqual([quiz]),
    },
    {
      name: 'question set',
      seed: (bank: RuntimeQuestionBank) =>
        bank.configureApi({ revision: 'old', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }, [
          { revision: 'old', topics, quizzes: [quiz] },
        ]),
      start: (bank: RuntimeQuestionBank) => bank.ensureQuestions('q1'),
      late: { revision: 'old', questions: [question] },
      expectCurrent: (bank: RuntimeQuestionBank) => expect(bank.listQuestions('q1')).toEqual([]),
    },
  ])('ignores an old $name after a new revision is configured', async ({ seed, start, late, expectCurrent }) => {
    let resolveOld!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      resolveOld = resolve;
    });
    const transport: JsonTransport = { get: <T>() => pending as Promise<T> };
    const bank = new RuntimeQuestionBank(noRetries, () => 0, transport);
    seed(bank);
    const oldRequest = start(bank);
    bank.configureApi({ revision: 'new', subjects: [subject] }, [{ revision: 'new', topics, quizzes: [quiz] }]);
    resolveOld(late);
    await expect(oldRequest).rejects.toMatchObject({ kind: 'cancelled' });
    expectCurrent(bank);
  });
});

describe('quiz launch freshness', () => {
  it('checks every cached launch, blocks changed/deleted/moved content and outages, preserving study arrays', async () => {
    const subjects = [{ ...subject, quizCount: 1, quizIds: [quiz.id] }];
    const transport = { get: vi.fn().mockResolvedValue({ revision: 'rev-1', subjects }) };
    const bank = new RuntimeQuestionBank(noRetries, () => 0, transport);
    bank.configureApi({ revision: 'rev-1', subjects }, [{ revision: 'rev-1', topics, quizzes: [quiz] }]);
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
