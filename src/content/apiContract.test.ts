import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../../tests/fixtures/api-response-cases.json';
import { RuntimeQuestionBank } from './runtimeQuestionBank';

const noRetries = { maxRetries: 0, baseDelayMs: 100, maxDelayMs: 100 };
const reply = (body: unknown) => ({ ok: true, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('API response boundary fixtures', () => {
  it('accepts matching membership, order, and answer references', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(reply(fixtures.subjects))
      .mockResolvedValueOnce(reply(fixtures.quizzes))
      .mockResolvedValueOnce(reply(fixtures.questions)));
    await bank.ensureSubjects();
    await bank.ensureQuizzes('s1');
    await bank.ensureQuestions('q1');
    expect(bank.listQuestions('q1').map(question => question.id)).toEqual(['i1']);
  });

  it.fails('rejects duplicate quiz IDs in subject membership', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const subjects = structuredClone(fixtures.subjects);
    subjects.subjects[0].quizIds = ['q1', 'q1'];
    subjects.subjects[0].quizCount = 2;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(subjects)));
    await expect(bank.ensureSubjects()).rejects.toMatchObject({ kind: 'invalid' });
  });

  it.fails('rejects a quiz catalog that disagrees with subject membership', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const quizzes = structuredClone(fixtures.quizzes);
    quizzes.quizzes[0].id = 'q2';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(quizzes)));
    bank.configureApi(fixtures.subjects);
    await expect(bank.ensureQuizzes('s1')).rejects.toMatchObject({ kind: 'invalid' });
  });

  it.fails('rejects questions with invalid answer references', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const questions = structuredClone(fixtures.questions);
    questions.questions[0].answer = 'Z';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(questions)));
    bank.configureApi(fixtures.subjects, [fixtures.quizzes]);
    await expect(bank.ensureQuestions('q1')).rejects.toMatchObject({ kind: 'invalid' });
  });

  it.fails('rejects question IDs that disagree with the quiz catalog', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const questions = structuredClone(fixtures.questions);
    questions.questions[0].id = 'i2';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(questions)));
    bank.configureApi(fixtures.subjects, [fixtures.quizzes]);
    await expect(bank.ensureQuestions('q1')).rejects.toMatchObject({ kind: 'invalid' });
  });
});
