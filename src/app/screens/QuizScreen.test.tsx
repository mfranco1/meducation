import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../theme';
import { QuizScreen } from './QuizScreen';
import type { Attempt, Question, Quiz } from '../../domain/types';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', name: 'Quiz', sourcePdf: 'source.pdf', questionCount: 7, status: 'ready' };
const questions: Question[] = Array.from({ length: 7 }, (_, index) => ({
  id: `q${index + 1}`, subjectId: quiz.subjectId, quizId: quiz.id, stem: `Question ${index + 1}`, choices: [{ id: 'A', text: `Incorrect ${index + 1}` }, { id: 'B', text: `Correct ${index + 1}` }], verifiedAnswer: 'B', answerSource: 'verified', metadata: {}, source: { pdfFile: 'source.pdf' },
}));
const startingAttempt: Attempt = { id: 'attempt', quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: 'immediate', startedAt: new Date(0).toISOString(), responses: {}, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] } };

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

describe('quiz streak celebrations', () => {
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
