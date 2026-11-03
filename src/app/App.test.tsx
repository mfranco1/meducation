import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompletedAttempt } from '../domain/types';
import { LocalAttemptRepository } from '../persistence/localRepository';
import App from './App';
import { theme } from '../shared/theme';
import { runtimeQuestionBank } from '../content/api/runtimeQuestionBank';
import { installFlashcardApiFixture, installQuizApiFixture } from '../test/runtimeContentFixtures';

function completed(quizId: string, subjectId: string, percentage: number): CompletedAttempt {
  const at = '2026-10-02T00:00:00.000Z';
  return {
    id: `${quizId}-completed`,
    quizId,
    subjectId,
    feedbackMode: 'exam',
    elapsedMs: 0,
    celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] },
    startedAt: at,
    completedAt: at,
    responses: {},
    score: { correct: 1, incorrect: 0, unanswered: 0, total: 1, percentage, elapsedMs: 0 },
  };
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('progressive dashboard statistics', () => {
  it('calculates all subject scores after the summary request without opening a subject', async () => {
    const attempts = new LocalAttemptRepository();
    attempts.saveCompleted(completed('q1', 's1', 80));
    attempts.saveCompleted(completed('q2', 's2', 40));
    let resolveCatalog!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    const pendingCatalog = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveCatalog = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingCatalog);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    );
    expect(screen.getByRole('group', { name: 'Completed quizzes' })).toBeVisible();
    expect(within(screen.getByRole('group', { name: 'Completed quizzes' })).getByText('Completed')).toBeVisible();
    expect(screen.getByRole('heading', { name: '2' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Loading subjects' })).toBeVisible();

    await act(async () =>
      resolveCatalog({
        ok: true,
        json: async () => ({
          revision: 'rev-dashboard',
          subjects: [
            { id: 's1', name: 'First', accent: '#111111', quizCount: 1, quizIds: ['q1'] },
            { id: 's2', name: 'Second', accent: '#222222', quizCount: 1, quizIds: ['q2'] },
          ],
        }),
      }),
    );
    await waitFor(() =>
      expect(within(screen.getByRole('group', { name: 'Average quiz score' })).getByRole('heading')).toHaveTextContent(
        '60%',
      ),
    );
    expect(within(screen.getByRole('group', { name: 'Lowest quiz score' })).getByRole('heading')).toHaveTextContent(
      '40%',
    );
    expect(screen.getByRole('button', { name: 'Open Second' })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/subjects');
  });

  it('recovers a failed subject quiz catalog without changing saved progress', async () => {
    const subject = { id: 's1', name: 'Recovery Subject', accent: '#b9511b' };
    const quiz = {
      id: 'q1',
      subjectId: subject.id,
      topicId: 't1',
      name: 'Recovery Quiz',
      questionCount: 1,
      questionIds: ['i1'],
    };
    runtimeQuestionBank.configureApi({
      revision: 'rev-subject-recovery',
      subjects: [{ ...subject, quizCount: 1, quizIds: [quiz.id] }],
    });
    const attempts = new LocalAttemptRepository();
    attempts.saveCompleted(completed(quiz.id, subject.id, 80));
    const progressKeys = ['meducation.progress.v2'];
    const before = progressKeys.map((key) => localStorage.getItem(key));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null } })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          revision: 'rev-subject-recovery',
          topics: [{ id: 't1', subjectId: subject.id, name: 'Topic' }],
          quizzes: [quiz],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Recovery Subject' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We can’t load quizzes for Recovery Subject right now.');
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    expect(document.querySelectorAll('.MuiSkeleton-wave').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /^Retake quiz/ })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progressKeys.map((key) => localStorage.getItem(key))).toEqual(before);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/questions'))).toBe(true);
  });

  it('cancels a pending question launch on navigation without creating an attempt', async () => {
    const subject = { id: 's-cancel', name: 'Test Subject', accent: '#b9511b' };
    const quiz = {
      id: 'q-cancel',
      subjectId: subject.id,
      topicId: 't1',
      name: 'Test Quiz',
      questionCount: 1,
      questionIds: ['i-cancel'],
    };
    runtimeQuestionBank.configureApi(
      { revision: 'rev-cancel-app', subjects: [{ ...subject, quizCount: 1, quizIds: [quiz.id] }] },
      [{ revision: 'rev-cancel-app', topics: [{ id: 't1', subjectId: subject.id, name: 'Topic' }], quizzes: [quiz] }],
    );
    let resolveQuestions!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    const pendingQuestions = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveQuestions = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingQuestions);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Test Subject' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Start quiz/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map(([url]) => String(url).split('?')[0])).toEqual([
      `/api/v1/quizzes/${quiz.id}/questions`,
      '/api/v1/subjects',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
    expect(new LocalAttemptRepository().getActive(quiz.id)).toBeUndefined();

    await act(async () =>
      resolveQuestions({
        ok: true,
        json: async () => ({
          revision: 'rev-cancel-app',
          questions: [
            {
              id: 'i-cancel',
              quizId: quiz.id,
              stem: 'Question',
              choices: [
                { id: 'A', text: 'Choice' },
                { id: 'B', text: 'Alternative' },
              ],
              answer: 'A',
            },
          ],
        }),
      }),
    );
    expect(screen.queryByRole('heading', { name: 'Test Quiz' })).toBeNull();
    expect(new LocalAttemptRepository().getActive(quiz.id)).toBeUndefined();
    expect(runtimeQuestionBank.listQuestions(quiz.id)).toEqual([]);
  });

  it('leaves persisted progress unchanged when question loading fails', async () => {
    const subject = { id: 's-failure', name: 'Test Subject', accent: '#b9511b' };
    const quiz = {
      id: 'q-failure',
      subjectId: subject.id,
      topicId: 't1',
      name: 'Test Quiz',
      questionCount: 1,
      questionIds: ['i-failure'],
    };
    runtimeQuestionBank.configureApi(
      { revision: 'rev-failure-app', subjects: [{ ...subject, quizCount: 1, quizIds: [quiz.id] }] },
      [{ revision: 'rev-failure-app', topics: [{ id: 't1', subjectId: subject.id, name: 'Topic' }], quizzes: [quiz] }],
    );
    const attempts = new LocalAttemptRepository();
    attempts.saveCompleted(completed(quiz.id, subject.id, 80));
    const progressKeys = ['meducation.progress.v2'];
    const before = progressKeys.map((key) => localStorage.getItem(key));
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Test Subject' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Retake quiz/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));

    const questionFailure = await screen.findByRole('alert');
    expect(questionFailure).toHaveTextContent('Unable to load questions');
    expect(questionFailure).toHaveTextContent('Test Quiz: Please try again or come back later.');
    expect(screen.queryByText('Unable to load questions', { selector: 'h3' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close notification' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progressKeys.map((key) => localStorage.getItem(key))).toEqual(before);
    expect(runtimeQuestionBank.listQuestions(quiz.id)).toEqual([]);
  });
  it('fetches questions when quiz setup opens, loads the quiz screen once they arrive and keeps the attempt in browser storage', async () => {
    const subject = { id: 's1', name: 'Lazy Subject', accent: '#b9511b' };
    const quiz = {
      id: 'q1',
      subjectId: subject.id,
      topicId: 't1',
      name: 'Lazy Quiz',
      questionCount: 1,
      questionIds: ['i1'],
    };
    runtimeQuestionBank.configureApi(
      { revision: 'rev-lazy', subjects: [{ ...subject, quizCount: 1, quizIds: [quiz.id] }] },
      [{ revision: 'rev-lazy', topics: [{ id: 't1', subjectId: subject.id, name: 'Topic' }], quizzes: [quiz] }],
    );
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      url === '/api/v1/subjects'
        ? {
            ok: true,
            json: async () => ({ revision: 'rev-lazy', subjects: [{ ...subject, quizCount: 1, quizIds: [quiz.id] }] }),
          }
        : {
            ok: true,
            json: async () => ({
              revision: 'rev-lazy',
              questions: [
                {
                  id: 'i1',
                  quizId: quiz.id,
                  stem: 'Lazy question stem',
                  choices: [
                    { id: 'A', text: 'Choice' },
                    { id: 'B', text: 'Alternative' },
                  ],
                  answer: 'A',
                  rationale: 'Explanation',
                },
              ],
            }),
          },
    );
    vi.stubGlobal('fetch', fetchMock);
    const questionRequests = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/questions')).length;

    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Lazy Subject' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Start quiz/ }));
    await waitFor(() => expect(questionRequests()).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));

    await waitFor(() => expect(screen.getByText('Lazy question stem')).toBeVisible(), { timeout: 10_000 });
    expect(screen.getByText('Question 1 of 1')).toBeVisible();
    expect(new LocalAttemptRepository().getActive(quiz.id)).toBeDefined();
    expect(questionRequests()).toBe(1);
  }, 15_000);
  it('navigates between quiz and flashcard dashboards without changing quiz progress', async () => {
    runtimeQuestionBank.configureApi({ revision: 'rev-nav', subjects: [] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-nav', subjects: [] }) }),
    );
    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
    expect(screen.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Flashcards' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Quizzes' }));
    expect(await screen.findByRole('heading', { name: 'All Subjects' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Quizzes' })).toHaveAttribute('aria-current', 'page');
  });

  it.each(['quiz', 'flashcard'] as const)(
    'disables progress backup during %s study with save-and-leave guidance',
    async (type) => {
      // This checks backup availability after admission; browser tests cover cold lazy loading.
      await import('../features/flashcards/screens/FlashcardStudyScreen');
      const subject = { id: 's3', name: 'Backup subject', accent: '#b9511b' };
      if (type === 'quiz') {
        const quiz = {
          id: 'q3',
          subjectId: subject.id,
          topicId: 't1',
          name: 'Backup quiz',
          questionCount: 1,
          questionIds: ['i3'],
        };
        installQuizApiFixture(
          [subject],
          [quiz],
          [
            {
              id: 'i3',
              quizId: quiz.id,
              stem: 'Question',
              choices: [
                { id: 'A', text: 'Choice' },
                { id: 'B', text: 'Alternative' },
              ],
              answer: 'A',
              rationale: 'Fixture explanation',
              metadata: { topic: 'Fixture' },
            },
          ],
        );
      } else {
        runtimeQuestionBank.configureApi({ revision: 'empty', subjects: [] });
        await installFlashcardApiFixture(
          [{ ...subject, deckCount: 1, deckIds: ['d-backup'] }],
          [
            {
              id: 'd-backup',
              subjectId: subject.id,
              topicId: 't3',
              name: 'Backup deck',
              cardCount: 1,
              cardIds: ['f-backup'],
            },
          ],
          [{ id: 'f-backup', deckId: 'd-backup', front: 'Front', back: 'Back' }],
        );
      }
      render(
        <ThemeProvider theme={theme}>
          <App />
        </ThemeProvider>,
      );
      if (type === 'flashcard') fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Open Backup subject' }));
      fireEvent.click(await screen.findByRole('button', { name: type === 'quiz' ? /^Start quiz/ : /^Study deck/ }));
      if (type === 'quiz') fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));
      const position = type === 'quiz' ? 'Question 1 of 1' : 'Card 1 of 1';
      expect(await screen.findByText(position)).toBeVisible();

      const backupButton = screen.getByRole('button', { name: 'Progress' });
      expect(backupButton).toBeDisabled();
      expect(document.getElementById(backupButton.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
        'Save and leave your study session',
      );
      expect(screen.queryByRole('dialog', { name: 'Progress' })).toBeNull();
      expect(screen.getByText(position)).toBeVisible();
    },
  );

  it('saves arrow-key navigation on the destination card when exiting', async () => {
    runtimeQuestionBank.configureApi({ revision: 'rev-arrow', subjects: [] });
    await installFlashcardApiFixture(
      [{ id: 's4', name: 'Arrow subject', accent: '#123456', deckCount: 1, deckIds: ['d-arrow'] }],
      [
        {
          id: 'd-arrow',
          subjectId: 's4',
          topicId: 't4',
          name: 'Arrow deck',
          cardCount: 2,
          cardIds: ['f-arrow-1', 'f-arrow-2'],
        },
      ],
      [
        { id: 'f-arrow-1', deckId: 'd-arrow', front: 'First front', back: 'First back' },
        { id: 'f-arrow-2', deckId: 'd-arrow', front: 'Second front', back: 'Second back' },
      ],
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-arrow', subjects: [] }) }),
    );
    window.localStorage.clear();
    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Arrow subject' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Study deck/ }));
    // The study screen loads lazily; allow its module to settle under full-suite contention.
    expect(await screen.findByText('Card 1 of 2', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(document.querySelector('[aria-modal="true"]')).toHaveStyle({ visibility: 'hidden' });
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeEnabled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByText('Card 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save and exit deck' }));
    // The subject checkpoint reflects the destination selected with Arrow Right.
    expect(await screen.findByText(/\d\/2 reviewed/)).toBeInTheDocument();
  });

  it('keeps the current card open and reports an error when arrow navigation cannot save', async () => {
    runtimeQuestionBank.configureApi({ revision: 'rev-arrow-quota', subjects: [] });
    await installFlashcardApiFixture(
      [{ id: 's5', name: 'Arrow quota subject', accent: '#123456', deckCount: 1, deckIds: ['d-arrow-quota'] }],
      [
        {
          id: 'd-arrow-quota',
          subjectId: 's5',
          topicId: 't5',
          name: 'Arrow quota deck',
          cardCount: 2,
          cardIds: ['f-arrow-q1', 'f-arrow-q2'],
        },
      ],
      [
        { id: 'f-arrow-q1', deckId: 'd-arrow-quota', front: 'Saved first front', back: 'Saved first back' },
        { id: 'f-arrow-q2', deckId: 'd-arrow-quota', front: 'Saved second front', back: 'Saved second back' },
      ],
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ revision: 'rev-arrow-quota', subjects: [] }) }),
    );
    let progress: string | null = null;
    let progressWrites = 0;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === 'meducation.flashcards.progress.v2' ? progress : null),
      setItem: (key: string, value: string) => {
        if (key !== 'meducation.flashcards.progress.v2') return;
        progressWrites += 1;
        if (progressWrites > 1) throw new Error('Quota');
        progress = value;
      },
    });
    render(
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Arrow quota subject' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Study deck/ }));
    // The study screen loads lazily; allow its module to settle under full-suite contention.
    expect(await screen.findByText('Card 1 of 2', {}, { timeout: 10_000 })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Flashcard progress could not be saved');
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeInTheDocument();
  });

  it.each(['quizzes', 'flashcards'] as const)(
    'switches subject tabs during a pending %s launch without opening a study session',
    async (type) => {
      const subject = { id: 's6', name: 'Tab subject', accent: '#123456' };
      const quiz = {
        id: 'q6',
        subjectId: subject.id,
        topicId: 't6',
        name: 'Tab quiz',
        questionCount: 1,
        questionIds: ['i6'],
      };
      const deck = {
        id: 'd-tabs',
        subjectId: subject.id,
        topicId: 't6',
        name: 'Tab deck',
        cardCount: 1,
        cardIds: ['f-tabs'],
      };
      const cards = [{ id: 'f-tabs', deckId: deck.id, front: 'Front', back: 'Back' }];
      installQuizApiFixture([subject], [quiz], []);
      const bank = await installFlashcardApiFixture([{ ...subject, deckCount: 1, deckIds: [deck.id] }], [deck], cards);
      const values = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      });
      let finishLoad!: () => void;
      if (type === 'quizzes') {
        vi.spyOn(runtimeQuestionBank, 'ensureQuestions').mockImplementation(
          () =>
            new Promise((resolve) => {
              finishLoad = () => resolve([]);
            }),
        );
      } else {
        vi.spyOn(bank, 'ensureCards').mockImplementation(
          () =>
            new Promise((resolve) => {
              finishLoad = () => resolve(cards);
            }),
        );
      }
      render(
        <ThemeProvider theme={theme}>
          <App />
        </ThemeProvider>,
      );
      if (type === 'flashcards') fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Open Tab subject' }));
      if (type === 'quizzes') {
        fireEvent.click(screen.getByRole('button', { name: 'Start quiz: Tab quiz' }));
        fireEvent.click(screen.getByRole('button', { name: 'Begin Quiz' }));
      } else fireEvent.click(screen.getByRole('button', { name: 'Study deck: Tab deck' }));
      await waitFor(() => expect(finishLoad).toBeTypeOf('function'));
      const header = screen.getByRole('heading', { name: 'Tab subject' });
      const tabs = screen.getByRole('tablist', { name: 'Subject content' });
      const destination = type === 'quizzes' ? 'Flashcards' : 'Quizzes';
      fireEvent.click(screen.getByRole('tab', { name: destination }));
      expect(screen.getByRole('tab', { name: destination, selected: true })).toHaveFocus();
      await act(async () => finishLoad());
      expect(screen.getByRole('heading', { name: 'Tab subject' })).toBe(header);
      expect(screen.getByRole('tablist', { name: 'Subject content' })).toBe(tabs);
      expect(screen.getByRole('tabpanel', { name: destination })).toBeVisible();
      expect(
        screen.getByRole('button', { name: type === 'quizzes' ? 'Study deck: Tab deck' : 'Start quiz: Tab quiz' }),
      ).toBeVisible();
      expect(screen.queryByText(/Card 1 of|Question 1 of/)).toBeNull();
    },
  );
});
