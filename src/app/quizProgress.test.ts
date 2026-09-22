import { describe, expect, it } from 'vitest';
import type { QuizProgress } from './screens/SubjectScreen';
import { sortQuizProgressByRecentActivity } from './quizProgress';

const progress = (id: string): QuizProgress => ({
  quiz: { id, subjectId: 'subject', name: id, questionCount: 10 },
  completionCount: 0,
});

describe('sortQuizProgressByRecentActivity', () => {
  it('places the most recently used quiz first without mutating canonical order', () => {
    const quizzes = [progress('first'), progress('second'), progress('third')];
    const activity = new Map([
      ['first', '2026-09-20T00:00:00.000Z'],
      ['second', '2026-09-22T00:00:00.000Z'],
    ]);

    const ordered = sortQuizProgressByRecentActivity(quizzes, id => activity.get(id));

    expect(ordered.map(item => item.quiz.id)).toEqual(['second', 'first', 'third']);
    expect(quizzes.map(item => item.quiz.id)).toEqual(['first', 'second', 'third']);
  });

  it('keeps canonical order when activity is absent or tied', () => {
    const quizzes = [progress('first'), progress('second'), progress('third')];

    const ordered = sortQuizProgressByRecentActivity(quizzes, id => id === 'third' ? '2026-09-22T00:00:00.000Z' : undefined);

    expect(ordered.map(item => item.quiz.id)).toEqual(['third', 'first', 'second']);
  });
});
