import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentLoadError, RuntimeQuestionBank, runtimeQuestionBank } from './runtimeQuestionBank';

const subject = { id: 's1', name: 'Subject', accent: '#123456' };
const quiz = { id: 'q1', subjectId: 's1', name: 'Quiz', questionCount: 1, questionIds: ['i1'] };
const question = {
  id: 'i1', quizId: 'q1', stem: 'Question', choices: [{ id: 'A', text: 'Choice' }],
  answer: 'A', rationale: 'Reason',
};

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

  it('loads quiz questions lazily, hydrates sparse metadata, and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ revision: 'rev-1', questions: [question] }),
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
    const bank = new RuntimeQuestionBank();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-4', subjects: [subject] }) }));
    await expect(bank.ensureSubjects()).rejects.toMatchObject({ kind: 'invalid' });
    expect(bank.getCatalogState()).toBe('error');
    expect(bank.listSubjects()).toEqual([]);
  });

  it('times out subject loading, releases its loading state, and retries successfully', async () => {
    const bank = new RuntimeQuestionBank();
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
    const bank = new RuntimeQuestionBank();
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
    const bank = new RuntimeQuestionBank();
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
    const bank = new RuntimeQuestionBank();
    bank.configureApi({ revision: 'rev-7', subjects: [{ ...subject, quizCount: 1, quizIds: ['q1'] }] }, [{ revision: 'rev-7', quizzes: [quiz] }]);
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revision: 'rev-7', questions: [question] }) });
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
});
