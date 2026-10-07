import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/theme';
import { QuizScreen } from './QuizScreen';
import type { Attempt, Question, Quiz } from '../../../domain/types';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', name: 'Quiz', questionCount: 7 };
const questions: Question[] = Array.from({ length: 7 }, (_, index) => ({
  id: `q${index + 1}`, quizId: quiz.id, stem: `Question ${index + 1}`, choices: [{ id: 'A', text: `Incorrect ${index + 1}` }, { id: 'B', text: `Correct ${index + 1}` }], verifiedAnswer: 'B', rationale: 'Rationale', metadata: {},
}));
const startingAttempt: Attempt = { id: 'attempt', quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: 'immediate', elapsedMs: 0, contentSignature: 'fixture-content', startedAt: new Date(0).toISOString(), responses: {}, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] } };

function QuizHarness() {
  const [attempt, setAttempt] = useState(startingAttempt);
  const [index, setIndex] = useState(0);
  return <ThemeProvider theme={theme}><QuizScreen
    quiz={quiz}
    attempt={attempt}
    index={index}
    questions={questions}
    onCheckpoint={(next, nextIndex) => { setAttempt(next); if (nextIndex !== undefined) setIndex(nextIndex); }}
    onFinish={() => {}}
    onRequestExit={() => {}}
  /></ThemeProvider>;
}

const choose = (choice: 'A' | 'B', index: number) => fireEvent.click(screen.getByRole('radio', { name: new RegExp(`${choice}\\. ${choice === 'A' ? 'Incorrect' : 'Correct'} ${index}`) }));
const continueQuiz = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

function renderQuizForSubmission({ attempt = startingAttempt, onFinish = vi.fn() }: { attempt?: Attempt; onFinish?: () => void } = {}) {
  render(<ThemeProvider theme={theme}><QuizScreen quiz={quiz} attempt={attempt} index={questions.length - 1} questions={questions} onCheckpoint={() => {}} onFinish={onFinish} onRequestExit={() => {}} /></ThemeProvider>);
  return onFinish;
}

describe('quiz streak celebrations', () => {
  it('keeps multiple stem blocks in the question column beside the flag', () => {
    const multiBlockQuestion: Question = {
      ...questions[0], stem: 'First paragraph.\n\nSecond paragraph.\n\n- First item\n- Second item',
    };
    render(<ThemeProvider theme={theme}><QuizScreen quiz={quiz} attempt={startingAttempt} index={0} questions={[multiBlockQuestion]} onCheckpoint={() => {}} onFinish={() => {}} onRequestExit={() => {}} /></ThemeProvider>);
    const first = screen.getByText('First paragraph.');
    const second = screen.getByText('Second paragraph.');
    const list = screen.getByRole('list');
    const stemColumn = first.closest('.MuiBox-root');
    expect(stemColumn).toContainElement(second);
    expect(stemColumn).toContainElement(list);
    const flag = screen.getByRole('button', { name: 'Flag question' });
    expect(flag).toBeVisible();
    expect(flag.querySelector('.MuiTouchRipple-root')).toBeNull();
  });

  it('renders a LaTeX stem and revealed rationale in Fast Feedback', () => {
    const mathQuestion: Question = {
      ...questions[0], stem: 'Calculate $x^2$.', rationale: 'Use $x^2+y^2=z^2$.',
    };
    const answeredAttempt: Attempt = {
      ...startingAttempt,
      responses: { q1: { questionId: 'q1', selectedChoiceId: 'B', flagged: false, locked: true, timeMs: 0 } },
    };
    render(<ThemeProvider theme={theme}><QuizScreen quiz={quiz} attempt={answeredAttempt} index={0} questions={[mathQuestion]} onCheckpoint={() => {}} onFinish={() => {}} onRequestExit={() => {}} /></ThemeProvider>);
    expect(document.querySelectorAll('.katex')).toHaveLength(2);
    expect(document.querySelectorAll('.katex-mathml annotation')).toHaveLength(2);
  });

  it('shows 3-in-a-row, resets after an error, and shows it again after a rebuilt streak', () => {
    vi.useFakeTimers();
    render(<QuizHarness />);
    choose('B', 1); continueQuiz();
    choose('B', 2); continueQuiz();
    choose('B', 3);
    expect(screen.getByRole('status')).toHaveTextContent('3-in-a-row!');
    expect(screen.getAllByTestId('radiating-circles')).toHaveLength(2);
    continueQuiz();
    choose('A', 4); continueQuiz();
    act(() => vi.advanceTimersByTime(2500));
    choose('B', 5); continueQuiz();
    choose('B', 6); continueQuiz();
    choose('B', 7);
    expect(screen.getByRole('status')).toHaveTextContent('3-in-a-row!');
    vi.useRealTimers();
  }, 10_000);

  it('keeps Exam Mode free of live correctness celebrations', () => {
    const examAttempt = { ...startingAttempt, feedbackMode: 'exam' as const };
    render(<ThemeProvider theme={theme}><QuizScreen quiz={quiz} attempt={examAttempt} index={0} questions={questions} onCheckpoint={() => {}} onFinish={() => {}} onRequestExit={() => {}} /></ThemeProvider>);
    choose('B', 1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('radiating-circles')).toBeNull();
  });

  it('does not replay effects for a resumed locked correct response', () => {
    const resumedAttempt: Attempt = {
      ...startingAttempt,
      responses: { q1: { questionId: 'q1', selectedChoiceId: 'B', flagged: false, locked: true, timeMs: 0 } },
      celebrationProgress: { correctStreak: 1, awardedStreakMilestones: [] },
    };
    render(<ThemeProvider theme={theme}><QuizScreen quiz={quiz} attempt={resumedAttempt} index={0} questions={questions} onCheckpoint={() => {}} onFinish={() => {}} onRequestExit={() => {}} /></ThemeProvider>);
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('radiating-circles')).toBeNull();
  });
});

describe('quiz submission confirmation', () => {
  it('requires confirmation before Fast Feedback can finish a quiz', () => {
    const onFinish = renderQuizForSubmission();

    const finishButton = screen.getByRole('button', { name: 'Finish' });
    expect(finishButton).toHaveClass('MuiButton-containedPrimary');
    fireEvent.click(finishButton);

    const dialog = screen.getByRole('dialog', { name: 'Submit Test?' });
    expect(dialog).toHaveTextContent('Submitting ends this test and shows your results.');
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation before Exam Mode can submit a quiz', () => {
    const onFinish = renderQuizForSubmission({ attempt: { ...startingAttempt, feedbackMode: 'exam' } });

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByRole('dialog', { name: 'Submit Test?' })).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
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

describe('paused Fast Feedback stopwatch', () => {
  it('stays frozen while a fully answered quiz remains navigable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'));
    const responses = Object.fromEntries(questions.map(question => [question.id, {
      questionId: question.id, selectedChoiceId: 'B', flagged: false, locked: true, timeMs: 0,
    }]));
    function ReviewHarness() {
      const [attempt, setAttempt] = useState<Attempt>({
        ...startingAttempt,
        elapsedMs: 42_000,
        timerStartedAt: undefined,
        responses,
      });
      const [index, setIndex] = useState(0);
      return <ThemeProvider theme={theme}><QuizScreen
        quiz={quiz} attempt={attempt} index={index} questions={questions}
        onCheckpoint={(next, nextIndex) => { setAttempt(next); if (nextIndex !== undefined) setIndex(nextIndex); }}
        onFinish={() => {}} onRequestExit={() => {}}
      /></ThemeProvider>;
    }
    render(<ReviewHarness />);

    expect(screen.getByText('00:42')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('Question 2 of 7')).toBeInTheDocument();
    expect(screen.getByText('00:42')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
