import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Question, Quiz } from '../../domain/types';
import { theme } from '../theme';
import { QuizBrowseScreen } from './QuizBrowseScreen';

const quiz: Quiz = { id: 'quiz', subjectId: 'subject', name: 'Quiz', questionCount: 2 };
const questions: Question[] = [
  { id: 'q1', quizId: quiz.id, stem: 'Question one', choices: [{ id: 'A', text: 'First choice' }, { id: 'B', text: 'Second choice' }], verifiedAnswer: 'B', rationale: 'Explanation one', metadata: {} },
  { id: 'q2', quizId: quiz.id, stem: 'Question two', choices: [{ id: 'A', text: 'Third choice' }, { id: 'B', text: 'Fourth choice' }], answer: 'A', rationale: 'Explanation two', rationaleMeta: { answerReviewNote: 'Check this source key' }, choiceExplanations: { A: 'Choice detail' }, metadata: {} },
];

function renderBrowse(index = 0) {
  const onNavigate = vi.fn();
  const onDone = vi.fn();
  render(<ThemeProvider theme={theme}><QuizBrowseScreen quiz={quiz} index={index} questions={questions} onNavigate={onNavigate} onDone={onDone} /></ThemeProvider>);
  return { onNavigate, onDone };
}

describe('quiz answer browser', () => {
  it('shows the resolved correct choice and explanation immediately without response controls', () => {
    renderBrowse();

    expect(screen.getByText('Question one')).toBeVisible();
    expect(screen.getByText('Second choice')).toBeVisible();
    expect(screen.getByText('Explanation one')).toBeVisible();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Flag/ })).toBeNull();
    expect(screen.queryByText('Time')).toBeNull();
    expect(screen.queryByRole('button', { name: /Finish|Submit/ })).toBeNull();
  });

  it('supports previous, next, direct navigation, and Done', () => {
    const { onNavigate, onDone } = renderBrowse();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Question 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave answer browser' }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, 1);
    expect(onNavigate).toHaveBeenNthCalledWith(2, 1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('uses the source answer fallback and retains review and choice explanations', () => {
    renderBrowse(1);

    expect(screen.getByText('Third choice')).toBeVisible();
    expect(screen.getByText('Answer key under review')).toBeVisible();
    expect(screen.getByText(/Answer under review: Check this source key/)).toBeVisible();
    expect(screen.getByText('Choice detail')).toBeVisible();
  });

  it('shows Answer unavailable without marking any choice when no answer is present', () => {
    const unansweredQuestion = { ...questions[0], answer: undefined, verifiedAnswer: undefined };
    render(<ThemeProvider theme={theme}><QuizBrowseScreen quiz={quiz} index={0} questions={[unansweredQuestion]} onNavigate={() => {}} onDone={() => {}} /></ThemeProvider>);

    expect(screen.getByText('Answer unavailable')).toBeVisible();
    expect(screen.queryByText('Second choice')).toBeVisible();
    expect(screen.getByText('Explanation one')).toBeVisible();
  });
});
