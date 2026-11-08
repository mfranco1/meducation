import { StrictMode } from 'react';
import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Attempt, CompletedAttempt, FeedbackMode, Quiz } from '../../../domain/types';
import { theme } from '../../../shared/theme';
import { SubjectScreen, type QuizProgress } from './SubjectScreen';
import { matchMediaFor } from '../../../test/setup';

const subject = { id: 'subject', name: 'Biochemistry', description: '', accent: '#b9511b' };
const topics = [
  { id: 't1', subjectId: subject.id, name: 'Cell biology', description: 'Organelles and membranes' },
  { id: 't2', subjectId: subject.id, name: 'Metabolism' },
];
const quiz = { id: 'quiz', subjectId: subject.id, topicId: 't1', name: 'Practice test 1', questionCount: 10 };
const activeAttempt: Attempt = {
  id: 'attempt',
  quizId: quiz.id,
  subjectId: subject.id,
  feedbackMode: 'exam',
  elapsedMs: 0,
  celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
  contentSignature: 'fixture-content',
  startedAt: '2026-09-21T00:00:00.000Z',
  responses: {},
};

function renderSubject(progress: Partial<QuizProgress>, attempts: CompletedAttempt[] = []) {
  const onReviewAttempt = vi.fn<(quiz: Quiz, attempt: CompletedAttempt) => void>();
  const onResumeQuiz = vi.fn();
  const onStartQuiz = vi.fn<(quiz: Quiz, mode: FeedbackMode, shuffle: boolean) => void>();
  const onBrowseQuiz = vi.fn<(quiz: Quiz) => void>();
  render(
    <ThemeProvider theme={theme}>
      <SubjectScreen
        subject={subject}
        topics={topics}
        progress={[{ quiz, completionCount: 0, ...progress }]}
        attemptsFor={() => attempts}
        onReviewAttempt={onReviewAttempt}
        onResumeQuiz={onResumeQuiz}
        onStartQuiz={onStartQuiz}
        onBrowseQuiz={onBrowseQuiz}
      />
    </ThemeProvider>,
  );
  return { onResumeQuiz, onStartQuiz, onBrowseQuiz, onReviewAttempt };
}

const completedAttempt: CompletedAttempt = {
  ...activeAttempt,
  id: 'done',
  completedAt: '2026-09-22T11:00:00.000Z',
  score: { correct: 8, incorrect: 2, unanswered: 0, total: 10, percentage: 80, elapsedMs: 0 },
};

describe('subject quiz review', () => {
  it('lists saved attempts and opens the chosen one', () => {
    const { onReviewAttempt } = renderSubject({ completionCount: 1 }, [completedAttempt]);
    fireEvent.click(screen.getByRole('button', { name: `Review attempts: ${quiz.name}` }));
    const dialog = screen.getByRole('dialog', { name: 'Review Attempts' });
    expect(within(dialog).getByText(/Exam Mode · Elapsed Time: 00:00:00/)).toBeVisible();
    expect(within(dialog).getByText('1 attempt')).toBeVisible();
    expect(within(dialog).getByText('80%')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Review attempt from Sep 22, 2026 at / }));
    expect(onReviewAttempt).toHaveBeenCalledWith(expect.objectContaining({ id: quiz.id }), completedAttempt);
  });

  it('explains when older attempts were pruned', () => {
    renderSubject({ completionCount: 3 });
    fireEvent.click(screen.getByRole('button', { name: `Review attempts: ${quiz.name}` }));
    expect(screen.getByText('Older attempts are no longer saved on this device.')).toBeVisible();
  });

  it('hides Review for a quiz without completions', () => {
    renderSubject({});
    expect(screen.queryByRole('button', { name: /Review attempts/ })).toBeNull();
  });
});

describe('subject quiz action', () => {
  it('shows the shared empty display only after quiz loading finishes', () => {
    const props = {
      subject,
      topics,
      progress: [],
      attemptsFor: () => [],
      onReviewAttempt: vi.fn(),
      onResumeQuiz: vi.fn(),
      onStartQuiz: vi.fn(),
      onBrowseQuiz: vi.fn(),
    };
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <SubjectScreen {...props} loading />
      </ThemeProvider>,
    );

    expect(screen.queryByRole('heading', { name: 'No quizzes available yet' })).toBeNull();
    rerender(
      <ThemeProvider theme={theme}>
        <SubjectScreen {...props} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('heading', { name: 'No quizzes available yet' })).toBeVisible();
  });

  it('keeps shimmer placeholders and exposes one recovery banner after failure', () => {
    const onRetry = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SubjectScreen
          subject={subject}
          topics={topics}
          progress={[]}
          error={new Error('raw backend detail')}
          recovery={{ failed: true, retrying: false, busy: false }}
          onRetry={onRetry}
          onResumeQuiz={() => {}}
          onStartQuiz={() => {}}
          onBrowseQuiz={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('region', { name: 'Content recovery' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(`We can’t load quizzes for ${subject.name} right now.`);
    expect(screen.queryByRole('heading', { name: 'No quizzes available yet' })).toBeNull();
    expect(screen.queryByText('raw backend detail')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps shimmer quiz skeletons visible during automatic retries without reconnecting copy', () => {
    render(
      <ThemeProvider theme={theme}>
        <SubjectScreen
          subject={subject}
          topics={topics}
          progress={[]}
          retrying
          recovery={{ failed: true, retryAt: Date.now() + 5_000, retrying: true, busy: false }}
          onResumeQuiz={() => {}}
          onStartQuiz={() => {}}
          onBrowseQuiz={() => {}}
        />
      </ThemeProvider>,
    );
    const region = screen.getByRole('status', { name: 'Retrying quizzes' });
    expect(region).toBeVisible();
    expect(within(region).getByRole('heading', { name: 'Topics' })).toBeVisible();
    expect(within(region).getByRole('searchbox', { name: 'Search topics and quizzes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
    expect(screen.queryByText('Reconnecting…')).toBeNull();
    expect(screen.getAllByRole('status', { name: 'Retrying quizzes' })).toHaveLength(1);
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

  it.each([
    ['the default Fast Feedback mode', undefined, 'immediate', true],
    ['Exam Mode', 'Exam Mode', 'exam', true],
    ['shuffle switched off', 'Shuffle questions and choices', 'immediate', false],
  ] as const)('starts with %s', (_name, control, mode, shuffle) => {
    const { onStartQuiz } = renderSubject({});

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    if (control === 'Exam Mode') fireEvent.click(screen.getByRole('button', { name: control }));
    if (control === 'Shuffle questions and choices') fireEvent.click(screen.getByRole('switch', { name: control }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));

    expect(onStartQuiz).toHaveBeenCalledWith(quiz, mode, shuffle);
  });

  it('opens the read-only answer browser through its separate callback', () => {
    const { onBrowseQuiz, onStartQuiz } = renderSubject({});
    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    const dialog = screen.getByRole('dialog', { name: quiz.name });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Browse Answers' }));
    expect(
      within(dialog).getByText(
        'Browse every question with the correct answer and explanation shown. Nothing is recorded.',
      ),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open quiz' }));
    expect(onBrowseQuiz).toHaveBeenCalledWith(quiz);
    expect(onStartQuiz).not.toHaveBeenCalled();
  });

  it('resets the selected mode to Fast Feedback when setup is reopened', () => {
    const { onBrowseQuiz } = renderSubject({});
    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exam Mode' }));
    expect(screen.getByText('Answers remain hidden until you finish and submit the entire test.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close quiz setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    expect(screen.getByText('Selecting an answer locks it and shows the explanation right away.')).toBeVisible();
    expect(onBrowseQuiz).not.toHaveBeenCalled();
  });

  it('hides Browse Answers outside the dev server', () => {
    vi.stubEnv('DEV', false);
    try {
      renderSubject({});
      fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
      expect(
        within(screen.getByRole('dialog', { name: quiz.name })).queryByRole('button', { name: 'Browse Answers' }),
      ).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close quiz setup' }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' })],
  ])('dismisses setup with %s without starting a quiz', (_name, dismiss) => {
    const { onStartQuiz } = renderSubject({});

    fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Practice test 1' }));
    dismiss();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onStartQuiz).not.toHaveBeenCalled();
  });
});

describe('subject topics', () => {
  const other = { id: 'other', subjectId: subject.id, topicId: 't2', name: 'Glycolysis quiz', questionCount: 1 };
  const done = { id: 'done', subjectId: subject.id, topicId: 't1', name: 'Second quiz', questionCount: 5 };

  function renderTopics(progress: QuizProgress[], onStartQuiz = vi.fn()) {
    render(
      <ThemeProvider theme={theme}>
        <SubjectScreen
          subject={subject}
          topics={[...topics, { id: 't3', subjectId: subject.id, name: 'Empty topic' }]}
          progress={progress}
          onResumeQuiz={() => {}}
          onStartQuiz={onStartQuiz}
          onBrowseQuiz={() => {}}
        />
      </ThemeProvider>,
    );
  }

  it('lists topics that have quizzes with progress and switches the quiz list on selection', () => {
    renderTopics([
      { quiz, completionCount: 1, latestScore: 80 },
      { quiz: done, completionCount: 0 },
      { quiz: other, completionCount: 0 },
    ]);

    expect(screen.getByRole('heading', { name: 'Quizzes' })).toBeVisible();
    expect(screen.queryByText('2 topics')).toBeNull();
    expect(screen.queryByRole('button', { name: /Empty topic/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Cell biology/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: 'Practice test 1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Second quiz' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Glycolysis quiz' })).toBeNull();
    expect(screen.getByText('1 of 2 quizzes completed')).toBeVisible();
    expect(screen.getByText('Organelles and membranes')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Metabolism/ }));
    expect(screen.queryByText('Organelles and membranes')).toBeNull();
    expect(screen.getByRole('button', { name: /Metabolism/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: 'Glycolysis quiz' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Practice test 1' })).toBeNull();
    expect(screen.queryByText('Not started')).toBeNull();
  });

  it('orders topics and quizzes by most recent activity, leaving untouched ones in catalog order', () => {
    const older = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const newer = new Date(Date.now() - 86_400_000).toISOString();
    renderTopics([
      { quiz, completionCount: 0 },
      { quiz: done, completionCount: 0, activityAt: older },
      { quiz: other, completionCount: 0, activityAt: newer },
    ]);

    expect(
      screen.getAllByRole('button', { name: /Cell biology|Metabolism/ }).map((button) => button.textContent),
    ).toEqual([expect.stringContaining('Metabolism'), expect.stringContaining('Cell biology')]);
    fireEvent.click(screen.getByRole('button', { name: /Cell biology/ }));
    expect(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)).toEqual([
      'Second quiz',
      'Practice test 1',
    ]);
  });

  it('opens on the topic with the most recent activity and shows relative activity and answered progress', () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    renderTopics([
      { quiz, completionCount: 0 },
      {
        quiz: other,
        completionCount: 0,
        active: { ...activeAttempt, quizId: other.id },
        answeredCount: 1,
        activityAt: recent,
      },
    ]);

    expect(screen.getByRole('button', { name: /Metabolism/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('1/1 answered')).toBeVisible();
    expect(screen.getByText('100%')).toBeVisible();
    expect(screen.getByText('2 days ago')).toBeVisible();
  });

  it('filters topics and lists matching quizzes in Results, ignoring case and accents', () => {
    renderTopics([
      { quiz, completionCount: 0 },
      { quiz: { ...other, name: 'Glycolysé quiz' }, completionCount: 0 },
    ]);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics and quizzes' }), {
      target: { value: ' GLYCOLYSE ' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('1 topic, 1 quiz');
    expect(screen.getByRole('button', { name: /Metabolism/ })).toHaveTextContent('1 matching quiz');
    expect(screen.queryByRole('button', { name: /Cell biology/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Results' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Metabolism', level: 3 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start quiz: Glycolysé quiz' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Metabolism/ }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.queryByRole('heading', { name: 'Results' })).toBeNull();
    expect(screen.getByRole('button', { name: /Cell biology/ })).toBeVisible();
  });

  it('explains when nothing matches and clears the search', () => {
    renderTopics([{ quiz, completionCount: 0 }]);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No topics or quizzes match “zzz”')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Practice test 1' })).toBeVisible();
  });
});

describe('subject topics on small screens', () => {
  it('drills from the topic list into a topic and back', async () => {
    window.matchMedia = matchMediaFor(() => false);
    const other = { id: 'other', subjectId: subject.id, topicId: 't2', name: 'Glycolysis quiz', questionCount: 1 };
    render(
      <ThemeProvider theme={theme}>
        <SubjectScreen
          subject={subject}
          topics={topics}
          progress={[
            { quiz, completionCount: 0 },
            { quiz: other, completionCount: 0 },
          ]}
          onResumeQuiz={() => {}}
          onStartQuiz={() => {}}
          onBrowseQuiz={() => {}}
        />
      </ThemeProvider>,
    );

    expect(screen.queryByRole('heading', { name: 'Quizzes' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Metabolism/ }));
    expect(screen.getByRole('heading', { name: 'Metabolism' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Glycolysis quiz' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Topics' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Topics' }));
    expect(await screen.findByRole('heading', { name: 'Topics' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Glycolysis quiz' })).toBeNull();
    expect(screen.getByRole('button', { name: /Metabolism/ })).toHaveFocus();
  });

  it('returns to the topic list on browser Back', async () => {
    window.matchMedia = matchMediaFor(() => false);
    render(
      <ThemeProvider theme={theme}>
        <SubjectScreen
          subject={subject}
          topics={topics}
          progress={[{ quiz, completionCount: 0 }]}
          onResumeQuiz={() => {}}
          onStartQuiz={() => {}}
          onBrowseQuiz={() => {}}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Cell biology/ }));
    expect(screen.queryByRole('heading', { name: 'Topics' })).toBeNull();
    history.back();
    expect(await screen.findByRole('heading', { name: 'Topics' })).toBeVisible();
  });
});

describe('subject search on small screens', () => {
  it('shows results under the topic list and keeps the query when a topic is opened and closed', async () => {
    window.matchMedia = matchMediaFor(() => false);
    const other = { id: 'other', subjectId: subject.id, topicId: 't2', name: 'Glycolysis quiz', questionCount: 1 };
    render(
      <ThemeProvider theme={theme}>
        <SubjectScreen
          subject={subject}
          topics={topics}
          progress={[
            { quiz, completionCount: 0 },
            { quiz: other, completionCount: 0 },
          ]}
          onResumeQuiz={() => {}}
          onStartQuiz={() => {}}
          onBrowseQuiz={() => {}}
        />
      </ThemeProvider>,
    );

    screen.getByRole('searchbox').focus();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'glyco' } });
    expect(screen.getByRole('searchbox')).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Results' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start quiz: Glycolysis quiz' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Cell biology/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Metabolism/ }));
    expect(screen.queryByRole('searchbox')).toBeNull();
    history.back();
    expect(await screen.findByRole('searchbox')).toHaveValue('glyco');
    expect(screen.getByRole('heading', { name: 'Results' })).toBeVisible();
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
  ] as const)('shows the %s indicator next to the latest score', (trend, label) => {
    renderSubject({ completionCount: 2, latestScore: 75, trend });

    expect(screen.getByText('Score 75%')).toBeVisible();
    expect(screen.getByRole('img', { name: label })).toBeVisible();
  });
});

describe('continue studying destination', () => {
  it.each([true, false])('reveals the latest unfinished quiz after loading (desktop: %s)', async (desktop) => {
    window.matchMedia = matchMediaFor(() => desktop);
    const recent = { ...quiz, id: 'recent', topicId: 't2', name: 'Recent unfinished quiz' };
    const completed = { ...quiz, id: 'completed', name: 'Newer completed quiz' };
    const props = {
      subject,
      topics,
      continueStudying: true,
      onResumeQuiz: vi.fn(),
      onStartQuiz: vi.fn(),
      onBrowseQuiz: vi.fn(),
      progress: [
        { quiz, completionCount: 0, active: activeAttempt, activityAt: '2026-10-01T00:00:00Z' },
        {
          quiz: recent,
          completionCount: 0,
          active: { ...activeAttempt, quizId: recent.id },
          activityAt: '2026-10-02T00:00:00Z',
        },
        { quiz: completed, completionCount: 1, activityAt: '2026-10-03T00:00:00Z' },
      ],
    };
    const { rerender } = render(
      <StrictMode>
        <ThemeProvider theme={theme}>
          <SubjectScreen {...props} progress={[]} loading />
        </ThemeProvider>
      </StrictMode>,
    );
    expect(screen.queryByRole('heading', { name: recent.name })).toBeNull();
    rerender(
      <StrictMode>
        <ThemeProvider theme={theme}>
          <SubjectScreen {...props} />
        </ThemeProvider>
      </StrictMode>,
    );
    expect(screen.getByRole('heading', { name: recent.name })).toHaveFocus();
    expect(screen.getByRole('button', { name: `Resume quiz: ${recent.name}` })).toBeVisible();
    expect(props.onResumeQuiz).not.toHaveBeenCalled();
    if (!desktop) {
      history.back();
      expect(await screen.findByRole('heading', { name: 'Topics' })).toBeVisible();
      expect(screen.getByRole('button', { name: /Metabolism/ })).toHaveFocus();
    }
  });

  it.each([undefined, '2026-10-01T00:00:00Z'])(
    'uses catalog order when unfinished activity is tied or missing (%s)',
    (activityAt) => {
      const props = {
        subject,
        topics,
        continueStudying: true,
        onResumeQuiz: vi.fn(),
        onStartQuiz: vi.fn(),
        onBrowseQuiz: vi.fn(),
      };
      render(
        <ThemeProvider theme={theme}>
          <SubjectScreen
            {...props}
            progress={[
              { quiz, completionCount: 0, active: activeAttempt, activityAt },
              {
                quiz: { ...quiz, id: 'other', topicId: 't2', name: 'Other quiz' },
                completionCount: 0,
                active: activeAttempt,
                activityAt,
              },
            ]}
          />
        </ThemeProvider>,
      );
      expect(screen.getByRole('heading', { name: quiz.name })).toHaveFocus();
    },
  );

  it('keeps the normal mobile topic list when no unfinished quiz remains', () => {
    window.matchMedia = matchMediaFor(() => false);
    render(
      <ThemeProvider theme={theme}>
        <SubjectScreen
          subject={subject}
          topics={topics}
          continueStudying
          progress={[{ quiz, completionCount: 1 }]}
          onResumeQuiz={vi.fn()}
          onStartQuiz={vi.fn()}
          onBrowseQuiz={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Topics' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: quiz.name })).toBeNull();
  });
});
