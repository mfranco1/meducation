import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/theme';
import { QuizScreen } from './QuizScreen';
import type { Attempt, Question, Quiz } from '../../../domain/types';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', topicId: 't1', name: 'Quiz', questionCount: 7 };
const questions: Question[] = Array.from({ length: 7 }, (_, index) => ({
  id: `q${index + 1}`, quizId: quiz.id, stem: `Question ${index + 1}`, choices: [{ id: 'A', text: `Incorrect ${index + 1}` }, { id: 'B', text: `Correct ${index + 1}` }], answer: 'B', rationale: 'Rationale', metadata: {},
}));
const startingAttempt: Attempt = { id: 'attempt', quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: 'immediate', elapsedMs: 0, contentSignature: 'fixture-content', startedAt: new Date(0).toISOString(), responses: {}, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] } };

function QuizHarness({ items = questions }: { items?: Question[] }) {
  const [attempt, setAttempt] = useState(startingAttempt);
  const [index, setIndex] = useState(0);
  return <ThemeProvider theme={theme}><QuizScreen
    quiz={quiz}
    attempt={attempt}
    index={index}
    questions={items}
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
  afterEach(() => vi.useRealTimers());
  it('uses Left and Right for checkpoint navigation without selecting answers or submitting', () => {
    const onCheckpoint = vi.fn();
    const onFinish = vi.fn();
    render(<ThemeProvider theme={theme}><QuizScreen quiz={quiz} attempt={startingAttempt} index={1} questions={questions} onCheckpoint={onCheckpoint} onFinish={onFinish} onRequestExit={() => {}} /></ThemeProvider>);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onCheckpoint).toHaveBeenCalledWith(startingAttempt, 0);
    fireEvent.keyDown(screen.getByRole('radio', { name: /Incorrect 2/ }), { key: 'ArrowRight' });
    expect(onCheckpoint).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onCheckpoint).toHaveBeenLastCalledWith(startingAttempt, 2);
    expect(onFinish).not.toHaveBeenCalled();

  });

  it('chooses answers with number and letter keys, selecting in Exam Mode and locking in Fast Feedback', () => {
    const threeChoices: Question = { ...questions[0], choices: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }, { id: 'C', text: 'Third' }], answer: 'B' };
    const renderWith = (attempt: Attempt) => render(<ThemeProvider theme={theme}><QuizHarnessFor attempt={attempt} /></ThemeProvider>);
    function QuizHarnessFor({ attempt: initial }: { attempt: Attempt }) {
      const [attempt, setAttempt] = useState(initial);
      return <QuizScreen quiz={quiz} attempt={attempt} index={0} questions={[threeChoices]} onCheckpoint={next => setAttempt(next)} onFinish={() => {}} onRequestExit={() => {}} />;
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
    expect(screen.getAllByTestId('radiating-circles')).toHaveLength(1);
    expect(screen.getByTestId('gold-burst')).toBeInTheDocument();
    continueQuiz();
    choose('A', 4); continueQuiz();
    act(() => vi.advanceTimersByTime(1000));
    choose('B', 5); continueQuiz();
    choose('B', 6); continueQuiz();
    choose('B', 7);
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole('status')).toHaveTextContent('3-in-a-row!');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('status')).toBeNull();
  }, 10_000);

  it('replaces an active streak reward immediately and gives the new reward its full lifetime', () => {
    vi.useFakeTimers();
    render(<QuizHarness />);
    for (let index = 1; index <= 3; index++) { choose('B', index); continueQuiz(); }
    expect(screen.getByRole('status')).toHaveTextContent('3-in-a-row!');
    act(() => vi.advanceTimersByTime(1000));
    choose('B', 4); continueQuiz();
    choose('B', 5);
    expect(screen.getByRole('status')).toHaveTextContent('5-in-a-row!');
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole('status')).toHaveTextContent('5-in-a-row!');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('status')).toBeNull();
  }, 10_000);

  it('dismisses a reward on time while the learner navigates, answers and flags questions', () => {
    vi.useFakeTimers();
    render(<QuizHarness />);
    choose('B', 1); continueQuiz();
    choose('B', 2); continueQuiz();
    choose('B', 3);
    act(() => vi.advanceTimersByTime(1000));
    continueQuiz();
    choose('B', 4);
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole('button', { name: 'Flag question' }));
    expect(screen.getByRole('status')).toHaveTextContent('3-in-a-row!');
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('status')).toBeNull();
  }, 10_000);

  it('plays only Perfect Test when the last answer also reaches a streak milestone', () => {
    vi.useFakeTimers();
    render(<QuizHarness items={questions.slice(0, 5)} />);
    for (let index = 1; index <= 4; index++) { choose('B', index); continueQuiz(); }
    choose('B', 5);
    expect(screen.getByRole('status')).toHaveTextContent('Perfect Test!');
    act(() => vi.advanceTimersByTime(3200));
    expect(screen.queryByRole('status')).toBeNull();
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
