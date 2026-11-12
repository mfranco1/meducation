import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/theme';
import { scoreAnimationDuration } from '../components/results/ResultsScoreHero';
import { ResultsScreen } from './ResultsScreen';
import type { CompletedAttempt, Quiz } from '../../../domain/types';
import { matchMediaFor } from '../../../test/setup';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', topicId: 't1', name: 'Quiz', questionCount: 3 };
const attemptFor = (correct: number, total: number, percentage: number): CompletedAttempt => ({
  id: 'attempt',
  quizId: quiz.id,
  subjectId: quiz.subjectId,
  feedbackMode: 'exam',
  elapsedMs: 0,
  celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
  startedAt: new Date(0).toISOString(),
  completedAt: new Date(1).toISOString(),
  responses: {},
  score: { correct, incorrect: total - correct, unanswered: 0, total, percentage, elapsedMs: 0 },
});
const renderResults = (attempt: CompletedAttempt) =>
  render(
    <ThemeProvider theme={theme}>
      <ResultsScreen quiz={quiz} attempt={attempt} questions={[]} onBack={() => {}} />
    </ThemeProvider>,
  );

const stubReducedMotion = (reduce: boolean) => {
  window.matchMedia = matchMediaFor((query) => reduce && query === '(prefers-reduced-motion: reduce)');
};

beforeEach(() => stubReducedMotion(true));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('perfect score ring', () => {
  it('turns gold for an exact non-empty perfect score only', () => {
    const arcStroke = () => screen.getByTestId('score-ring-arc').getAttribute('stroke');
    const { rerender } = renderResults(attemptFor(3, 3, 100));
    expect(arcStroke()).toMatch(/^url\(#/);
    rerender(
      <ThemeProvider theme={theme}>
        <ResultsScreen quiz={quiz} attempt={attemptFor(99, 100, 99)} questions={[]} onBack={() => {}} />
      </ThemeProvider>,
    );
    expect(arcStroke()).not.toMatch(/^url\(#/);
  });
});

describe('results score hero', () => {
  it('shows the score ring in place of the check and preserves the result summary and back action', () => {
    const onBack = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <ResultsScreen quiz={quiz} attempt={attemptFor(2, 3, 67)} questions={[]} onBack={onBack} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Quiz results' })).toBeVisible();
    expect(screen.getByText('Final score: 67%.')).toBeInTheDocument();
    expect(screen.getByText('2 correct · 1 incorrect · 0 unanswered')).toBeVisible();
    expect(screen.getByText('Total time')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to quizzes' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each(['exam', 'immediate'] as const)('offers review of a %s result', (feedbackMode) => {
    const onReview = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <ResultsScreen
          quiz={quiz}
          attempt={{ ...attemptFor(2, 3, 67), feedbackMode }}
          questions={[]}
          onBack={() => {}}
          onReview={onReview}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review results' }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Back to quizzes' })).toBeVisible();
  });
});

describe('results reveal', () => {
  let frame: FrameRequestCallback | undefined;
  const setupMotion = () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(performance, 'now').mockReturnValue(0);
  };

  it('shows the score alone until the ring settles, then reveals each layer', () => {
    setupMotion();
    renderResults(attemptFor(3, 3, 100));
    expect(screen.getByTestId('score-percentage')).toBeVisible();
    expect(screen.getByText('Back to quizzes')).not.toBeVisible();
    expect(screen.getByText('3 correct · 0 incorrect · 0 unanswered')).not.toBeVisible();

    act(() => frame?.(scoreAnimationDuration(100) + 1));
    for (let step = 0; step < 6; step += 1) act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('button', { name: 'Back to quizzes' })).toBeVisible();
  });

  it('advances one layer per tap or Space, finishing the count-up first', () => {
    setupMotion();
    renderResults(attemptFor(3, 3, 100));
    const hidden = (text: string) => expect(screen.getByText(text)).not.toBeVisible();
    fireEvent.click(screen.getByText('Quiz results'));
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('100%');
    hidden('Back to quizzes');
    fireEvent.click(screen.getByText('Quiz results'));
    hidden('3 correct · 0 incorrect · 0 unanswered');
    fireEvent.click(screen.getByText('Quiz results'));
    expect(screen.getByText('3 correct · 0 incorrect · 0 unanswered')).toBeVisible();
    hidden('Total time');
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText('Total time')).toBeVisible();
    hidden('Back to quizzes');
    fireEvent.click(screen.getByText('Quiz results'));
    expect(screen.getByRole('button', { name: 'Back to quizzes' })).toBeVisible();
  });
});
