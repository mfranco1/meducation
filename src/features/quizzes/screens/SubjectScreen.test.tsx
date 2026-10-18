import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Attempt, FeedbackMode, Quiz } from '../../../domain/types';
import { theme } from '../../../shared/theme';
import { SubjectScreen, type QuizProgress } from './SubjectScreen';

const subject = { id: 'subject', name: 'Biochemistry', description: '', accent: '#b9511b' };
const topics = [{ id: 't1', subjectId: subject.id, name: 'Cell biology' }, { id: 't2', subjectId: subject.id, name: 'Metabolism' }];
const quiz = { id: 'quiz', subjectId: subject.id, topicId: 't1', name: 'Practice test 1', questionCount: 10 };
const activeAttempt: Attempt = {
  id: 'attempt',
  quizId: quiz.id,
  subjectId: subject.id,
  feedbackMode: 'exam',
  elapsedMs: 0, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, contentSignature: 'fixture-content', startedAt: '2026-09-21T00:00:00.000Z',
  responses: {},
};

function renderSubject(progress: Partial<QuizProgress>) {
  const onResumeQuiz = vi.fn();
  const onStartQuiz = vi.fn<(quiz: Quiz, mode: FeedbackMode) => void>();
  const onBrowseQuiz = vi.fn<(quiz: Quiz) => void>();
  render(<ThemeProvider theme={theme}><SubjectScreen
    subject={subject}
    topics={topics}
    progress={[{ quiz, completionCount: 0, ...progress }]}
    onBack={() => {}}
    onResumeQuiz={onResumeQuiz}
    onStartQuiz={onStartQuiz}
    onBrowseQuiz={onBrowseQuiz}
  /></ThemeProvider>);
  return { onResumeQuiz, onStartQuiz, onBrowseQuiz };
}

describe('subject quiz action', () => {
  it('shows the shared empty display only after quiz loading finishes and keeps back navigation available', () => {
    const onBack = vi.fn();
    const props = { subject, topics, progress: [], onBack, onResumeQuiz: vi.fn(), onStartQuiz: vi.fn(), onBrowseQuiz: vi.fn() };
    const { rerender } = render(<ThemeProvider theme={theme}><SubjectScreen {...props} loading /></ThemeProvider>);

    expect(screen.queryByRole('heading', { name: 'No quizzes available yet' })).toBeNull();
    rerender(<ThemeProvider theme={theme}><SubjectScreen {...props} /></ThemeProvider>);

    expect(screen.getByRole('heading', { name: 'No quizzes available yet' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'All subjects' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'All subjects' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('keeps shimmer placeholders and exposes one full-width recovery banner after failure', () => {
    const onRetry = vi.fn();
    render(<ThemeProvider theme={theme}><SubjectScreen subject={subject} topics={topics} progress={[]} error={new Error('raw backend detail')} recovery={{ failed: true, retrying: false, busy: false }} onRetry={onRetry} onBack={() => {}} onResumeQuiz={() => {}} onStartQuiz={() => {}} onBrowseQuiz={() => {}} /></ThemeProvider>);
    expect(screen.getByRole('region', { name: 'Content recovery' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(`We can’t load quizzes for ${subject.name} right now.`);
    expect(screen.queryByRole('heading', { name: 'No quizzes available yet' })).toBeNull();
    expect(screen.queryByText('raw backend detail')).toBeNull();
    expect(document.querySelectorAll('.MuiSkeleton-root')).toHaveLength(4);
    expect(document.querySelectorAll('.MuiSkeleton-wave')).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps shimmer quiz skeletons visible during automatic retries without reconnecting copy', () => {
    render(<ThemeProvider theme={theme}><SubjectScreen
      subject={subject} topics={topics} progress={[]} retrying recovery={{ failed: true, retryAt: Date.now() + 5_000, retrying: true, busy: false }} onBack={() => {}} onResumeQuiz={() => {}}
      onStartQuiz={() => {}} onBrowseQuiz={() => {}}
    /></ThemeProvider>);
    expect(screen.getByRole('status', { name: 'Retrying quizzes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
    expect(screen.queryByText('Reconnecting…')).toBeNull();
    expect(screen.getAllByRole('status', { name: 'Retrying quizzes' })).toHaveLength(1);
    expect(document.querySelectorAll('.MuiSkeleton-wave').length).toBeGreaterThan(0);
  });

  it('labels a never-started quiz as Start', () => {
    renderSubject({});

    expect(screen.getByRole('button', { name: 'Start quiz: Practice test 1' })).toBeVisible();
  });

  it('labels a completed quiz as Retake', () => {
    renderSubject({ completionCount: 1 });

    expect(screen.getByRole('button', { name: 'Retake quiz: Practice test 1' })).toBeVisible();
  });

  it('prioritizes Resume test when a saved attempt exists', () => {
    const { onResumeQuiz } = renderSubject({ active: activeAttempt, completionCount: 1, answeredCount: 3 });

    expect(screen.getByRole('button', { name: 'Resume quiz: Practice test 1' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retake quiz: Practice test 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume quiz: Practice test 1' }));
    expect(onResumeQuiz).toHaveBeenCalledWith(quiz);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    [{}, 'Start quiz: Practice test 1'],
    [{ completionCount: 1 }, 'Retake quiz: Practice test 1'],
  ])('opens setup for %s', (progress, actionLabel) => {
    renderSubject(progress);

    fireEvent.click(screen.getByRole('button', { name: actionLabel }));

    const dialog = screen.getByRole('dialog', { name: quiz.name });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText(quiz.name)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Begin Quiz' })).toBeVisible();
  });

  it('starts a selected mode and resets it when setup is reopened', () => {
    const { onStartQuiz } = renderSubject({});

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exam Mode' }));
    expect(screen.getByText('Answers remain hidden until you finish and submit the entire test.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));
    expect(onStartQuiz).toHaveBeenCalledWith(quiz, 'exam');

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    expect(screen.getByText('Selecting an answer locks it and shows the explanation right away.')).toBeVisible();
  });

  it('starts in Fast Feedback mode by default', () => {
    const { onStartQuiz } = renderSubject({});

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));

    expect(onStartQuiz).toHaveBeenCalledWith(quiz, 'immediate');
  });

  it('opens the read-only answer browser through its separate callback', () => {
    const { onBrowseQuiz, onStartQuiz } = renderSubject({});
    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    const dialog = screen.getByRole('dialog', { name: quiz.name });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Browse Answers' }));
    expect(within(dialog).getByText('Browse every question with the correct answer and explanation shown. Nothing is recorded.')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open quiz' }));
    expect(onBrowseQuiz).toHaveBeenCalledWith(quiz);
    expect(onStartQuiz).not.toHaveBeenCalled();
  });

  it('resets Browse Answers to Fast Feedback when setup is reopened', () => {
    const { onBrowseQuiz } = renderSubject({});
    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browse Answers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close quiz setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    expect(screen.getByText('Selecting an answer locks it and shows the explanation right away.')).toBeVisible();
    expect(onBrowseQuiz).not.toHaveBeenCalled();
  });

  it('dismisses setup without starting a quiz', () => {
    const { onStartQuiz } = renderSubject({});

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close quiz setup' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onStartQuiz).not.toHaveBeenCalled();
  });

  it('dismisses setup with Escape without starting a quiz', () => {
    const { onStartQuiz } = renderSubject({});

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onStartQuiz).not.toHaveBeenCalled();
  });
});

describe('subject topics', () => {
  const other = { id: 'other', subjectId: subject.id, topicId: 't2', name: 'Glycolysis quiz', questionCount: 1 };
  const done = { id: 'done', subjectId: subject.id, topicId: 't1', name: 'Second quiz', questionCount: 5 };

  function renderTopics(progress: QuizProgress[], onStartQuiz = vi.fn()) {
    render(<ThemeProvider theme={theme}><SubjectScreen subject={subject} topics={[...topics, { id: 't3', subjectId: subject.id, name: 'Empty topic' }]} progress={progress} onBack={() => {}} onResumeQuiz={() => {}} onStartQuiz={onStartQuiz} onBrowseQuiz={() => {}} /></ThemeProvider>);
  }

  it('lists topics that have quizzes with progress and switches the quiz list on selection', () => {
    renderTopics([{ quiz, completionCount: 1, latestScore: 80 }, { quiz: done, completionCount: 0 }, { quiz: other, completionCount: 0 }]);

    expect(screen.getByRole('heading', { name: 'Quizzes' })).toBeVisible();
    expect(screen.queryByText('2 topics')).toBeNull();
    expect(screen.queryByRole('button', { name: /Empty topic/ })).toBeNull();
    expect(screen.getByText('1 / 3 quizzes completed')).toBeVisible();
    expect(screen.getByText('33%')).toBeVisible();
    expect(screen.getByRole('button', { name: /Cell biology/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: 'Practice test 1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Second quiz' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Glycolysis quiz' })).toBeNull();
    expect(screen.getByText('1 of 2 quizzes completed')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Metabolism/ }));
    expect(screen.getByRole('button', { name: /Metabolism/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: 'Glycolysis quiz' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Practice test 1' })).toBeNull();
    expect(screen.queryByText('Not started')).toBeNull();
  });

  it('opens on the topic with the most recent activity and shows relative activity and answered progress', () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    renderTopics([{ quiz, completionCount: 0 }, { quiz: other, completionCount: 0, active: { ...activeAttempt, quizId: other.id }, answeredCount: 1, activityAt: recent }]);

    expect(screen.getByRole('button', { name: /Metabolism/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('1/1 answered')).toBeVisible();
    expect(screen.getByText('100%')).toBeVisible();
    expect(screen.getByText('2 days ago')).toBeVisible();
  });
});

describe('subject topics on small screens', () => {
  it('drills from the topic list into a topic and back', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const other = { id: 'other', subjectId: subject.id, topicId: 't2', name: 'Glycolysis quiz', questionCount: 1 };
    render(<ThemeProvider theme={theme}><SubjectScreen subject={subject} topics={topics} progress={[{ quiz, completionCount: 0 }, { quiz: other, completionCount: 0 }]} onBack={() => {}} onResumeQuiz={() => {}} onStartQuiz={() => {}} onBrowseQuiz={() => {}} /></ThemeProvider>);

    expect(screen.queryByRole('heading', { name: 'Quizzes' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Metabolism/ }));
    expect(screen.getByRole('heading', { name: 'Metabolism' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Glycolysis quiz' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Topics' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(screen.getByRole('heading', { name: 'Topics' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Glycolysis quiz' })).toBeNull();
    expect(screen.getByRole('button', { name: /Metabolism/ })).toHaveFocus();
  });
});

describe('subject quiz score summaries', () => {
  it('shows the latest score without a lowest-score pill', () => {
    renderSubject({ completionCount: 2, latestScore: 75 });

    expect(screen.getByText('Completed 2 times')).toBeVisible();
    expect(screen.getByText('Score 75%')).toBeVisible();
    expect(screen.queryByText(/Lowest score/)).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it.each([
    ['increase', 'Score increased from previous attempt'],
    ['decrease', 'Score decreased from previous attempt'],
    ['unchanged', 'Score unchanged from previous attempt'],
  ] as const)('shows the %s indicator inside the latest-score pill', (trend, label) => {
    renderSubject({ completionCount: 2, latestScore: 75, trend });

    const latestScore = screen.getByText('Score 75%');
    expect(latestScore.closest('.MuiChip-root')).toContainElement(screen.getByRole('img', { name: label }));
  });
});
