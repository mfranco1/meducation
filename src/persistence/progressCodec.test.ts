import { describe, expect, it } from 'vitest';
import type { Attempt } from '../domain/types';
import { decodeProgress, emptyProgress } from './progressCodec';

const attempt = (quizId: string, questionIds?: unknown): Attempt =>
  ({
    id: `attempt-${quizId}`,
    quizId,
    subjectId: 's1',
    feedbackMode: 'exam',
    startedAt: '2026-09-20T00:00:00.000Z',
    elapsedMs: 0,
    celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
    contentSignature: 'sig',
    responses: {},
    ...(questionIds === undefined ? {} : { questionIds }),
  }) as Attempt;

const decode = (active: Attempt) =>
  decodeProgress(JSON.parse(JSON.stringify({ ...emptyProgress(), active: { [active.quizId]: active } })));
const ids = (count: number) => Array.from({ length: count }, (_, i) => `q${i}`);

describe('progress codec generated test attempts', () => {
  it('round-trips the selected question IDs', () => {
    expect(decode(attempt('mixed-test', ids(300)))?.active['mixed-test']?.questionIds).toEqual(ids(300));
    expect(decode(attempt('subject-test:s1', ['a', 'b']))?.active['subject-test:s1']?.questionIds).toEqual(['a', 'b']);
  });

  it('keeps authored quiz attempts without question IDs', () => {
    expect(decode(attempt('quiz-1'))).toBeDefined();
  });

  it.each([
    ['duplicates', ['a', 'a']],
    ['an empty list', []],
    ['more than 300', ids(301)],
    ['non-strings', ['a', 2]],
    ['empty strings', ['a', '']],
    ['a non-array', 'a'],
  ])('rejects progress with %s', (_name, questionIds) => {
    expect(decode(attempt('mixed-test', questionIds))).toBeUndefined();
  });

  it('rejects a generated test attempt without question IDs', () => {
    expect(decode(attempt('mixed-test'))).toBeUndefined();
    expect(decode(attempt('subject-test:s1'))).toBeUndefined();
  });
});
