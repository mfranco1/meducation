import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtures from '../../tests/fixtures/api-response-cases.json';
import { isQuestionList, isQuizCatalog } from './apiDecoders';
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

  it('rejects duplicate quiz IDs in subject membership', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const subjects = structuredClone(fixtures.subjects);
    subjects.subjects[0].quizIds = ['q1', 'q1'];
    subjects.subjects[0].quizCount = 2;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(subjects)));
    await expect(bank.ensureSubjects()).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('rejects a quiz catalog that disagrees with subject membership', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const quizzes = structuredClone(fixtures.quizzes);
    quizzes.quizzes[0].id = 'q2';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(quizzes)));
    bank.configureApi(fixtures.subjects);
    await expect(bank.ensureQuizzes('s1')).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('rejects questions with invalid answer references', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const questions = structuredClone(fixtures.questions);
    questions.questions[0].answer = 'Z';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(questions)));
    bank.configureApi(fixtures.subjects, [fixtures.quizzes]);
    await expect(bank.ensureQuestions('q1')).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('rejects question IDs that disagree with the quiz catalog', async () => {
    const bank = new RuntimeQuestionBank(noRetries);
    const questions = structuredClone(fixtures.questions);
    questions.questions[0].id = 'i2';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(questions)));
    bank.configureApi(fixtures.subjects, [fixtures.quizzes]);
    await expect(bank.ensureQuestions('q1')).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('rejects catalog counts that do not match ordered IDs', () => {
    const response = structuredClone(fixtures.quizzes);
    response.quizzes[0].questionCount = 2;
    expect(isQuizCatalog(response, 's1', ['q1'])).toBe(false);
  });

  it('rejects blank text and duplicate choice IDs', () => {
    const blank = structuredClone(fixtures.questions);
    blank.questions[0].stem = '  ';
    expect(isQuestionList(blank, 'q1', ['i1'])).toBe(false);
    const duplicate = structuredClone(fixtures.questions);
    duplicate.questions[0].choices[1].id = 'A';
    expect(isQuestionList(duplicate, 'q1', ['i1'])).toBe(false);
  });

  it('rejects malformed nested metadata and incomplete review provenance', () => {
    const metadata = structuredClone(fixtures.questions) as unknown as Record<string, unknown>;
    const question = (metadata.questions as Record<string, unknown>[])[0];
    question.metadata = { tags: [2] };
    expect(isQuestionList(metadata, 'q1', ['i1'])).toBe(false);
    delete question.metadata;
    question.rationaleMeta = { provenance: 'ai_draft_reviewed' };
    expect(isQuestionList(metadata, 'q1', ['i1'])).toBe(false);
  });

  it('accepts sparse valid nested metadata', () => {
    const response = structuredClone(fixtures.questions) as unknown as Record<string, unknown>;
    const question = (response.questions as Record<string, unknown>[])[0];
    question.metadata = { topic: 'Anatomy', tags: ['reviewed'] };
    question.rationaleMeta = {
      provenance: 'ai_draft_reviewed', reviewedAt: '2026-10-02', reviewNote: 'Checked',
    };
    expect(isQuestionList(response, 'q1', ['i1'])).toBe(true);
  });

  it('requires the canonical question order', () => {
    const response = structuredClone(fixtures.questions);
    response.questions.push({ ...structuredClone(response.questions[0]), id: 'i2' });
    expect(isQuestionList(response, 'q1', ['i1', 'i2'])).toBe(true);
    response.questions.reverse();
    expect(isQuestionList(response, 'q1', ['i1', 'i2'])).toBe(false);
  });
});
