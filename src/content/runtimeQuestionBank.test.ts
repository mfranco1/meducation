import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtimeQuestionBank } from './runtimeQuestionBank';

const subject = { id: 's1', name: 'Subject', accent: '#123456' };
const quiz = { id: 'q1', subjectId: 's1', name: 'Quiz', questionCount: 1, questionIds: ['i1'] };
const question = {
  id: 'i1', quizId: 'q1', stem: 'Question', choices: [{ id: 'A', text: 'Choice' }],
  answer: 'A', rationale: 'Reason',
};

afterEach(() => vi.unstubAllGlobals());

describe('runtime question bank', () => {
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
    await expect(runtimeQuestionBank.ensureQuestions('q1')).rejects.toThrow('Reload the app');
    expect(runtimeQuestionBank.listQuestions('q1')).toEqual([]);
  });
});
