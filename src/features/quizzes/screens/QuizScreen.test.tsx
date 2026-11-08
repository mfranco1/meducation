import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { markdownReady } from '../../../test/markdownReady';
import { theme } from '../../../shared/theme';
import { QuizScreen } from './QuizScreen';
import type { Attempt, Question, Quiz } from '../../../domain/types';

beforeAll(markdownReady, 30000);

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', topicId: 't1', name: 'Quiz', questionCount: 7 };
const questions: Question[] = Array.from({ length: 7 }, (_, index) => ({
  id: `q${index + 1}`,
  quizId: quiz.id,
  stem: `Question ${index + 1}`,
  choices: [
    { id: 'A', text: `Incorrect ${index + 1}` },
    { id: 'B', text: `Correct ${index + 1}` },
  ],
  answer: 'B',
  rationale: 'Rationale',
  metadata: {},
}));
const startingAttempt: Attempt = {
  id: 'attempt',
  quizId: quiz.id,
  subjectId: quiz.subjectId,
  feedbackMode: 'immediate',
  elapsedMs: 0,
  contentSignature: 'fixture-content',
  startedAt: new Date(0).toISOString(),
  responses: {},
  celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
};

function QuizHarness({ items = questions }: { items?: Question[] }) {
  const [attempt, setAttempt] = useState(startingAttempt);
  const [index, setIndex] = useState(0);
  return (
    <ThemeProvider theme={theme}>
      <QuizScreen
        quiz={quiz}
        attempt={attempt}
        index={index}
        questions={items}
        onCheckpoint={(next, nextIndex) => {
          setAttempt(next);
          if (nextIndex !== undefined) setIndex(nextIndex);
        }}
        onFinish={() => {}}
        onRequestExit={() => {}}
      />
    </ThemeProvider>
  );
}

const choose = (choice: 'A' | 'B', index: number) =>
  fireEvent.click(
    screen.getByRole('radio', {
      name: new RegExp(`${choice}\\. ${choice === 'A' ? 'Incorrect' : 'Correct'} ${index}`),
    }),
  );
const continueQuiz = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

// React selects the prefixed event in jsdom, which has no AnimationEvent constructor.
const finishCelebration = () => {
  const card = screen.getByTestId('celebration-card');
  fireEvent(card, new Event('AnimationEvent' in window ? 'animationend' : 'webkitAnimationEnd', { bubbles: true }));
};

function renderQuizForSubmission({
  attempt = startingAttempt,
  onFinish = vi.fn(),
}: { attempt?: Attempt; onFinish?: () => void } = {}) {
  render(
    <ThemeProvider theme={theme}>
      <QuizScreen
        quiz={quiz}
        attempt={attempt}
        index={0}
        questions={questions}
        onCheckpoint={() => {}}
        onFinish={onFinish}
        onRequestExit={() => {}}
      />
    </ThemeProvider>,
  );
  return onFinish;
}

describe('quiz streak celebrations', () => {
  afterEach(() => vi.useRealTimers());
  it('wires Left and Right to question navigation without selecting answers', () => {
    render(<QuizHarness />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Question 2 of 7')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('radio', { name: /Incorrect 2/ }), { key: 'ArrowRight' });
    expect(screen.getByText('Question 2 of 7')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Incorrect 2/ })).not.toBeChecked();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Question 1 of 7')).toBeInTheDocument();
  });

  it('chooses answers with number and letter keys, selecting in Exam Mode and locking in Fast Feedback', () => {
    const threeChoices: Question = {
      ...questions[0],
      choices: [
        { id: 'A', text: 'First' },
        { id: 'B', text: 'Second' },
        { id: 'C', text: 'Third' },
      ],
      answer: 'B',
    };
    const renderWith = (attempt: Attempt) =>
      render(
        <ThemeProvider theme={theme}>
          <QuizHarnessFor attempt={attempt} />
        </ThemeProvider>,
      );
    function QuizHarnessFor({ attempt: initial }: { attempt: Attempt }) {
      const [attempt, setAttempt] = useState(initial);
      return (
        <QuizScreen
          quiz={quiz}
          attempt={attempt}
          index={0}
          questions={[threeChoices]}
          onCheckpoint={(next) => setAttempt(next)}
          onFinish={() => {}}
          onRequestExit={() => {}}
        />
      );
    }
    const { unmount } = renderWith({ ...startingAttempt, feedbackMode: 'exam' });
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByRole('radio', { name: /Second/ })).toBeChecked();
    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByRole('radio', { name: /Third/ })).toBeChecked();
    expect(screen.queryByText('Rationale')).toBeNull();
    unmount();

    renderWith(startingAttempt);
    fireEvent.keyDown(screen.getByRole('radio', { name: /First/ }), { key: 'B' });
    expect(screen.getByRole('radio', { name: /Second/ })).toBeChecked();
    expect(screen.getByText('Rationale')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByRole('radio', { name: /Second/ })).toBeChecked();
  });

  it('shows 3-in-a-row, resets after an error, and shows it again after a rebuilt streak', () => {
    vi.useFakeTimers();
    render(<QuizHarness />);
    choose('B', 1);
    continueQuiz();
    choose('B', 2);
    continueQuiz();
    choose('B', 3);
    expect(screen.getByRole('status')).toHaveTextContent('3-in-a-row!');
    expect(screen.getAllByTestId('radiating-circles')).toHaveLength(1);
    expect(screen.getByTestId('gold-burst')).toBeInTheDocument();
    continueQuiz();
    choose('A', 4);
    continueQuiz();
    act(() => vi.advanceTimersByTime(1000));
    choose('B', 5);
    continueQuiz();
    choose('B', 6);
    continueQuiz();
    choose('B', 7);
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole('status')).toHaveTextContent('3-in-a-row!');
    act(() => vi.advanceTimersByTime(1000));
    finishCelebration();
    expect(screen.queryByRole('status')).toBeNull();
  }, 10_000);

  it('plays only Perfect Test when the last answer also reaches a streak milestone', () => {
    vi.useFakeTimers();
    render(<QuizHarness items={questions.slice(0, 5)} />);
    for (let index = 1; index <= 4; index++) {
      choose('B', index);
      continueQuiz();
    }
    choose('B', 5);
    expect(screen.getByRole('status')).toHaveTextContent('Perfect Test!');
    act(() => vi.advanceTimersByTime(3200));
    finishCelebration();
    expect(screen.queryByRole('status')).toBeNull();
    vi.useRealTimers();
  }, 10_000);

  it('keeps Exam Mode free of live correctness celebrations', () => {
    const examAttempt = { ...startingAttempt, feedbackMode: 'exam' as const };
    render(
      <ThemeProvider theme={theme}>
        <QuizScreen
          quiz={quiz}
          attempt={examAttempt}
          index={0}
          questions={questions}
          onCheckpoint={() => {}}
          onFinish={() => {}}
          onRequestExit={() => {}}
        />
      </ThemeProvider>,
    );
    choose('B', 1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('radiating-circles')).toBeNull();
  });
});

describe('quiz submission confirmation', () => {
  it.each([
    ['immediate', 'Finish'],
    ['exam', 'Submit'],
  ] as const)('requires confirmation before a %s quiz is submitted', (feedbackMode, button) => {
    const onFinish = renderQuizForSubmission({ attempt: { ...startingAttempt, feedbackMode } });
    fireEvent.click(screen.getByRole('button', { name: button }));

    const dialog = screen.getByRole('dialog', { name: 'Submit Test?' });
    expect(dialog).toHaveTextContent('Submitting ends this test and shows your results.');
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('cancels submission without finishing when cancelled, closed, or dismissed with Escape', async () => {
    const onFinish = renderQuizForSubmission();
    const openDialog = () => fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    openDialog();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    openDialog();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel submission' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    openDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onFinish).not.toHaveBeenCalled();
  });
});
