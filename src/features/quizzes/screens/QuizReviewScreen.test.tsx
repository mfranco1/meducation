import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { markdownReady } from '../../../test/markdownReady';
import type { CompletedAttempt, Question, Quiz } from '../../../domain/types';
import { theme } from '../../../shared/theme';
import { QuizReviewScreen } from './QuizReviewScreen';

beforeAll(markdownReady, 30000);

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', topicId: 't1', name: 'Quiz', questionCount: 2 };
const questions: Question[] = [
  {
    id: 'q1',
    quizId: quiz.id,
    stem: 'First question',
    choices: [
      { id: 'A', text: 'Wrong' },
      { id: 'B', text: 'Right' },
    ],
    answer: 'B',
    rationale: 'Why B is right.',
    metadata: {},
  },
  {
    id: 'q2',
    quizId: quiz.id,
    stem: 'Second question',
    choices: [{ id: 'A', text: 'Answer' }],
    answer: 'A',
    rationale: 'Why A is right.',
    metadata: {},
  },
];
const attempt: CompletedAttempt = {
  id: 'attempt',
  quizId: quiz.id,
  subjectId: quiz.subjectId,
  feedbackMode: 'exam',
  elapsedMs: 0,
  celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
  startedAt: 'now',
  completedAt: 'later',
  responses: { q1: { questionId: 'q1', selectedChoiceId: 'A', flagged: true, locked: false, timeMs: 0 } },
  score: { correct: 0, incorrect: 1, unanswered: 1, total: 2, percentage: 0, elapsedMs: 4_000 },
};

describe('QuizReviewScreen', () => {
  it('moves between wrong questions with Next and arrows when Wrong is selected', () => {
    const threeQuestions: Question[] = [
      questions[0],
      { ...questions[1], id: 'q2' },
      { ...questions[1], id: 'q3', stem: 'Third question' },
    ];
    const wrongAttempt: CompletedAttempt = {
      ...attempt,
      responses: {
        q1: { questionId: 'q1', selectedChoiceId: 'A', flagged: false, locked: false, timeMs: 0 },
        q2: { questionId: 'q2', selectedChoiceId: 'A', flagged: false, locked: false, timeMs: 0 },
        q3: { questionId: 'q3', selectedChoiceId: 'B', flagged: false, locked: false, timeMs: 0 },
      },
    };
    const onNavigate = vi.fn();
    const renderAt = (index: number) => (
      <ThemeProvider theme={theme}>
        <QuizReviewScreen
          quiz={quiz}
          attempt={wrongAttempt}
          index={index}
          questions={threeQuestions}
          onNavigate={onNavigate}
          onRequestExit={vi.fn()}
        />
      </ThemeProvider>
    );
    const { rerender } = render(renderAt(0));
    fireEvent.click(screen.getByRole('button', { name: 'Wrong questions, 2' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNavigate).toHaveBeenLastCalledWith(2);
    rerender(renderAt(2));
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('keeps multi-paragraph stems in one column beside the optional flag', () => {
    const multiBlockQuestions = [{ ...questions[0], stem: 'First paragraph.\n\nSecond paragraph.' }];
    const unflaggedAttempt = { ...attempt, responses: { q1: { ...attempt.responses.q1, flagged: false } } };
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <QuizReviewScreen
          quiz={quiz}
          attempt={unflaggedAttempt}
          index={0}
          questions={multiBlockQuestions}
          onNavigate={() => {}}
          onRequestExit={() => {}}
        />
      </ThemeProvider>,
    );
    const first = screen.getByText('First paragraph.');
    const second = screen.getByText('Second paragraph.');
    expect(first.parentElement?.parentElement).toBe(second.parentElement?.parentElement);
    expect(screen.queryByRole('img', { name: 'Flagged question' })).toBeNull();

    rerender(
      <ThemeProvider theme={theme}>
        <QuizReviewScreen
          quiz={quiz}
          attempt={attempt}
          index={0}
          questions={multiBlockQuestions}
          onNavigate={() => {}}
          onRequestExit={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('img', { name: 'Flagged question' })).toBeVisible();
  });

  it('reveals the submitted incorrect choice, correct answer, and explanation without answer controls', () => {
    const onExit = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <QuizReviewScreen
          quiz={quiz}
          attempt={attempt}
          index={0}
          questions={questions}
          onNavigate={() => {}}
          onRequestExit={onExit}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Incorrect')).toBeVisible();
    expect(screen.getByRole('listitem', { name: /Your answer/ })).toBeVisible();
    expect(screen.queryByText(/Your answer/)).toBeNull();
    expect(screen.getByRole('listitem', { name: /Correct answer/ })).toBeVisible();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(screen.getByText('Why B is right.')).toBeVisible();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('img', { name: 'Flagged question' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Leave review' }));
    expect(onExit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('labels unanswered responses and keeps the final duration static', () => {
    render(
      <ThemeProvider theme={theme}>
        <QuizReviewScreen
          quiz={quiz}
          attempt={attempt}
          index={1}
          questions={questions}
          onNavigate={() => {}}
          onRequestExit={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Unanswered')).toBeVisible();
    expect(screen.getByLabelText('Final time: 00:00:04')).toBeVisible();
    expect(screen.getByRole('listitem', { name: /Correct answer/ })).toBeVisible();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(screen.queryByText(/Your answer/)).toBeNull();
  });

  it('shows All, Wrong, and Flagged filters and retains the chosen filter during navigation', () => {
    const onNavigate = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <QuizReviewScreen
          quiz={quiz}
          attempt={attempt}
          index={0}
          questions={questions}
          onNavigate={onNavigate}
          onRequestExit={() => {}}
        />
      </ThemeProvider>,
    );
    const navigator = screen.getAllByLabelText('Question navigator')[0];
    expect(screen.getByRole('button', { name: 'All questions, 2' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Wrong questions, 1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Flagged questions, 1' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Unanswered questions/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Wrong questions, 1' }));
    expect(
      within(navigator).getByRole('button', { name: 'Question 1, answered incorrectly, flagged, current question' }),
    ).toBeVisible();
    expect(within(navigator).queryByRole('button', { name: /Question 2/ })).toBeNull();
    fireEvent.click(
      within(navigator).getByRole('button', { name: 'Question 1, answered incorrectly, flagged, current question' }),
    );
    expect(onNavigate).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: 'Wrong questions, 1' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Flagged questions, 1' }));
    expect(within(navigator).getByRole('button', { name: /Question 1, answered incorrectly, flagged/ })).toBeVisible();
  });

  it('shows a clear empty state for the Wrong filter', () => {
    const correctAttempt = { ...attempt, responses: { q1: { ...attempt.responses.q1, selectedChoiceId: 'B' } } };
    render(
      <ThemeProvider theme={theme}>
        <QuizReviewScreen
          quiz={quiz}
          attempt={correctAttempt}
          index={0}
          questions={questions}
          onNavigate={() => {}}
          onRequestExit={() => {}}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Wrong questions, 0' }));
    expect(screen.getByText('No wrong answers.')).toBeVisible();
  });
});
