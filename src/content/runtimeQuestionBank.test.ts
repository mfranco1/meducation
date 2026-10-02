import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentLoadError, getJsonWithRetry, RuntimeQuestionBank, runtimeQuestionBank } from './runtimeQuestionBank';

const subject = { id: 's1', name: 'Subject', accent: '#123456' };
const quiz = { id: 'q1', subjectId: 's1', name: 'Quiz', questionCount: 1, questionIds: ['i1'] };
const question = {
  id: 'i1', quizId: 'q1', stem: 'Question', choices: [{ id: 'A', text: 'Choice' }, { id: 'B', text: 'Alternative' }],
  answer: 'A', rationale: 'Reason', metadata: {},
};
const noRetries = { maxRetries: 0, baseDelayMs: 100, maxDelayMs: 100 };

afterEach(() => vi.unstubAllGlobals());

describe('runtime question bank', () => {
  it('loads only subject summaries before a selected subject catalog', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-0', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-0', quizzes: [quiz] }) });
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

  it('serves explicit local content without making backend requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const bank = new RuntimeQuestionBank(noRetries, () => 0);
    bank.configureLocal([subject], [quiz], [question]);

    await expect(bank.ensureSubjects()).resolves.toMatchObject([{ id: 's1', quizIds: ['q1'] }]);
    await expect(bank.ensureQuizzes('s1')).resolves.toEqual([quiz]);
    await expect(bank.ensureQuestions('q1')).resolves.toEqual([expect.objectContaining({ id: 'i1' })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads quiz questions lazily, hydrates sparse metadata, and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ revision: 'rev-1', questions: [{ ...question, metadata: undefined }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    runtimeQuestionBank.configureApi({ revision: 'rev-1', subjects: [subject] }, [
      { revision: 'rev-1', quizzes: [quiz] },
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ revision: 'rev-2', questions: [question] }),
    }));
    runtimeQuestionBank.configureApi({ revision: 'rev-1', subjects: [subject] }, [
      { revision: 'rev-1', quizzes: [quiz] },
    ]);
    await expect(runtimeQuestionBank.ensureQuestions('q1')).rejects.toMatchObject({ kind: 'revision' });
    expect(runtimeQuestionBank.listQuestions('q1')).toEqual([]);
  });

  it('loads only the selected subject catalog and deduplicates requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-3', quizzes: [quiz] }) });
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-4', subjects: [subject] }) }));
    await expect(bank.ensureSubjects()).rejects.toMatchObject({ kind: 'invalid' });
    expect(bank.getCatalogState()).toBe('error');
    expect(bank.listSubjects()).toEqual([]);
  });

  it('times out subject loading, releases its loading state, and retries successfully', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-5', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const pending = expect(bank.ensureSubjects()).rejects.toBeInstanceOf(ContentLoadError);
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;
      expect(bank.getCatalogState()).toBe('error');
      expect(bank.getCatalogError()).toMatchObject({ kind: 'timeout' });
      await bank.ensureSubjects();
      expect(bank.getCatalogState()).toBe('ready');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it('times out while reading an unfinished response body', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => undefined) }));
    vi.useFakeTimers();
    try {
      const pending = expect(bank.ensureSubjects()).rejects.toMatchObject({ kind: 'timeout' });
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;
      expect(bank.getCatalogState()).toBe('error');
    } finally { vi.useRealTimers(); }
  });

  it('times out quiz loading and retries only that subject', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    bank.configureApi({ revision: 'rev-6', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-6', quizzes: [quiz] }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const pending = expect(bank.ensureQuizzes('s1')).rejects.toMatchObject({ kind: 'timeout' });
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;
      expect(bank.getQuizState('s1')).toBe('error');
      await bank.ensureQuizzes('s1');
      expect(bank.getQuizState('s1')).toBe('ready');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it('times out question loading without caching content, then retries', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    bank.configureApi({ revision: 'rev-7', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }, [{ revision: 'rev-7', quizzes: [quiz] }]);
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-7', questions: [{ ...question, metadata: undefined }] }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const pending = expect(bank.ensureQuestions('q1')).rejects.toMatchObject({ kind: 'timeout' });
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;
      expect(bank.listQuestions('q1')).toEqual([]);
      await bank.ensureQuestions('q1');
      expect(bank.listQuestions('q1')).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it('treats a malformed quiz response as recoverable content failure', async () => {
    const bank = new RuntimeQuestionBank();
    bank.configureApi({ revision: 'rev-8', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quizzes: [quiz] }) }));
    await expect(bank.ensureQuizzes('s1')).rejects.toMatchObject({ kind: 'invalid' });
    expect(bank.getQuizState('s1')).toBe('error');
  });

  it('automatically retries transient failures with exponential backoff and reports the retrying state', async () => {
    const bank = new RuntimeQuestionBank({ maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 4000 }, () => 0);
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network offline'))
      .mockRejectedValueOnce(new TypeError('network offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-auto', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const pending = bank.ensureSubjects();
      await vi.waitFor(() => expect(bank.getCatalogState()).toBe('retrying'));
      expect(bank.getCatalogRetryAttempt()).toBe(1);
      await vi.advanceTimersByTimeAsync(500);
      await vi.waitFor(() => expect(bank.getCatalogRetryAttempt()).toBe(2));
      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(bank.getCatalogState()).toBe('ready');
    } finally { vi.useRealTimers(); }
  });

  it('shares a single automatic retry chain when callers request subjects during backoff', async () => {
    const bank = new RuntimeQuestionBank({ maxRetries: 1, baseDelayMs: 100, maxDelayMs: 500 }, () => 0);
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-dedupe', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }) });
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
    } finally { vi.useRealTimers(); }
  });

  it('keeps raw network exception details out of developer log fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('socket ECONNREFUSED private detail')));
    await expect(getJsonWithRetry('/api/v1/subjects', { policy: noRetries })).rejects.toMatchObject({ kind: 'network' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private detail');
    warn.mockRestore();
  });

  it('stops after the configured retry budget and allows a fresh manual operation', async () => {
    const bank = new RuntimeQuestionBank({ maxRetries: 1, baseDelayMs: 100, maxDelayMs: 500 }, () => 0);
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-manual', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }) });
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
    } finally { vi.useRealTimers(); }
  });

  it('cancels a question retry during backoff without starting another attempt', async () => {
    const bank = new RuntimeQuestionBank({ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 4000 }, () => 0);
    bank.configureApi({ revision: 'rev-cancel', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }, [{ revision: 'rev-cancel', quizzes: [quiz] }]);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const request = bank.ensureQuestions('q1');
      const cancelled = expect(request).rejects.toMatchObject({ kind: 'cancelled' });
      await vi.waitFor(() => expect(bank.getQuestionState('q1')).toBe('retrying'));
      bank.cancelQuestionLoad('q1');
      await cancelled;
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(bank.listQuestions('q1')).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('honors Retry-After on 503 and does not retry a permanent HTTP failure', async () => {
    const retryingFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => '2' } })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true }) });
    vi.stubGlobal('fetch', retryingFetch);
    vi.useFakeTimers();
    try {
      const onRetry = vi.fn();
      const request = getJsonWithRetry('/api/v1/subjects', {
        policy: { maxRetries: 1, baseDelayMs: 500, maxDelayMs: 3000 }, random: () => 0, onRetry,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(onRetry).toHaveBeenCalledWith(1, 2000);
      await vi.advanceTimersByTimeAsync(1999);
      expect(retryingFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(request).resolves.toEqual({ ready: true });
      expect(retryingFetch).toHaveBeenCalledTimes(2);

      const permanentFetch = vi.fn().mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
      vi.stubGlobal('fetch', permanentFetch);
      await expect(getJsonWithRetry('/api/v1/missing', { policy: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 3000 } }))
        .rejects.toMatchObject({ kind: 'http', status: 404 });
      expect(permanentFetch).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('stops instead of exceeding the delay limit from Retry-After', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => '31' } });
    vi.stubGlobal('fetch', fetchMock);
    const onRetry = vi.fn();
    await expect(getJsonWithRetry('/api/v1/subjects', {
      policy: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 30_000 }, onRetry,
    })).rejects.toMatchObject({ kind: 'http', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
