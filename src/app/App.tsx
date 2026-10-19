import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Container, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress } from '@mui/material';
import { loadRuntimeContent, runtimeQuestionBank } from '../content/api/runtimeQuestionBank';
import { loadRuntimeFlashcardSubjects, runtimeFlashcardBank } from '../content/api/runtimeFlashcardBank';
import { ContentLoadError } from '../content/api/contentTransport';
import { LocalAttemptRepository } from '../persistence/localRepository';
import { LocalFlashcardProgressRepository } from '../persistence/localFlashcardProgressRepository';
import { consumeProgressChangeNotice } from '../persistence/progressBackupStorage';
import { averageScore, lowestRecentScore } from '../analytics/analytics';
import type { Subject } from '../domain/types';
import { AppNavigationDrawer, type LearnerSection } from './components/AppNavigationDrawer';
import { ProgressBackupDialog } from './components/ProgressBackupDialog';
import { useProgressBackup } from './useProgressBackup';
import { AppShell } from '../shared/ui/shell/AppShell';
import { ScreenTransition } from '../shared/ui/transitions/ScreenTransition';
import { ScreenLoadBoundary } from '../shared/ui/loading/ScreenLoadBoundary';
import { ExitQuizDialog } from '../features/quizzes/components/quiz/ExitQuizDialog';
import { LeaveReviewDialog } from '../features/quizzes/components/quiz/LeaveReviewDialog';
import { ResumeContentDialog } from '../features/quizzes/components/quiz/ResumeContentDialog';
import { ToastProvider, useToast } from '../shared/ui/notifications/ToastProvider';
import { contentLoadMessage } from '../shared/ui/loading/notificationMessages';
import type { SubjectStat } from '../features/quizzes/selectors/progress';
import { createProgressView, quizProgressForSubject, subjectStatsFor } from '../features/quizzes/selectors/progress';
import { screenIdentity, type View } from './navigation';
import { DashboardScreen } from '../features/quizzes/screens/DashboardScreen';
import { QuizScreen, QuizBrowseScreen, QuizReviewScreen, ResultsScreen, FlashcardStudyScreen, preloadBrowseScreen, preloadQuizScreen, preloadResultsScreen, preloadReviewScreen, preloadFlashcardStudyScreen } from './lazyScreens';
import { SubjectScreen } from '../features/quizzes/screens/SubjectScreen';
import { FlashcardsDashboardScreen } from '../features/flashcards/screens/FlashcardsDashboardScreen';
import { FlashcardSubjectScreen } from '../features/flashcards/screens/FlashcardSubjectScreen';
import { useQuizSession, type QuizExitDestination } from '../features/quizzes/session/useQuizSession';
import { useQuizLaunch } from '../features/quizzes/session/useQuizLaunch';
import { useFlashcardSession } from '../features/flashcards/session/useFlashcardSession';
import { activeFlashcardSubjects, flashcardDashboardSubjects } from '../features/flashcards/selectors/flashcards';

const attemptRepository = new LocalAttemptRepository();
const flashcardProgressRepository = new LocalFlashcardProgressRepository();

function LearnerApp({ onProgress }: { onProgress: () => void }) {
  const toast = useToast();
  useEffect(() => {
    const change = consumeProgressChangeNotice();
    if (!change) return;
    const heading = document.querySelector<HTMLElement>('main h2');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
    toast.show({ message: change === 'reset' ? 'Progress reset.' : 'Progress restored.', severity: 'success', scope: { type: 'global' } });
  }, [toast]);
  const questionBank = runtimeQuestionBank;
  const contentSnapshotVersion = useSyncExternalStore(questionBank.subscribe, questionBank.getSnapshot);
  const progressSnapshot = useSyncExternalStore(attemptRepository.subscribe, attemptRepository.getSnapshot);
  const progressView = useMemo(() => createProgressView(progressSnapshot), [progressSnapshot]);
  useEffect(() => { void loadRuntimeContent().catch(() => undefined); }, []);
  const session = useQuizSession(questionBank, attemptRepository);
  const flashcards = useFlashcardSession(undefined, flashcardProgressRepository, ({ deck, subject, error }) => {
    toast.show({ id: `flashcard-load-${deck.id}`, title: 'Unable to load deck', message: <>{deck.name}: {contentLoadMessage(error)}</>, severity: 'error', position: 'bottom-right', ttlMs: null, closeButton: true, dismissPolicy: 'manual', scope: { type: 'screen', key: `flashcards-subject:${subject.id}` } });
  });
  const flashcardContentVersion = useSyncExternalStore(runtimeFlashcardBank.subscribe, runtimeFlashcardBank.getSnapshot);
  const flashcardSubjects = runtimeFlashcardBank.listSubjects();
  const flashcardDashboardData = useMemo(
    () => flashcardDashboardSubjects(flashcardSubjects, flashcards.progress),
    // The runtime cache exposes a version because its summary arrays are stable between writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flashcardSubjects, flashcards.progress, flashcardContentVersion],
  );
  const activeFlashcardSubjectCards = activeFlashcardSubjects(flashcardDashboardData);
  const { loadingQuizIds, launch, cancel } = useQuizLaunch(questionBank, ({ quiz, error }) => {
    toast.show({ id: `question-load-${quiz.id}`, title: 'Unable to load questions', message: <>{quiz.name}: {contentLoadMessage(error)}</>, severity: 'error', position: 'bottom-right', ttlMs: null, closeButton: true, dismissPolicy: 'manual', scope: { type: 'screen', key: `subject:${quiz.subjectId}` } });
  });
  const view: View = session.view.page === 'flashcards' ? flashcards.view : session.view;
  const currentScreenKey = screenIdentity(view);
  useLayoutEffect(() => { toast.notifyNavigation(currentScreenKey); }, [toast, currentScreenKey]);
  useEffect(() => { if (view.page === 'quiz') preloadResultsScreen(); if (view.page === 'flashcards-study') preloadFlashcardStudyScreen(); }, [view.page]);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitDestination, setExitDestination] = useState<QuizExitDestination>('subject');
  const [reviewExitOpen, setReviewExitOpen] = useState(false);
  const [screenLoading, setScreenLoading] = useState(false);
  const [reviewExitDestination, setReviewExitDestination] = useState<QuizExitDestination>('subject');
  const openProgressAfterReviewExit = useRef(false);
  const summaries = useMemo(
    () => questionBank.listSubjectSummaries(),
    // The external-store version invalidates a catalog whose array identity is not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionBank, contentSnapshotVersion],
  );
  const catalogState = questionBank.getCatalogState();
  const catalogError = questionBank.getCatalogError();
  const subjectStats = useMemo<SubjectStat[]>(
    () => subjectStatsFor(questionBank, progressView, summaries),
    [questionBank, progressView, summaries],
  );
  const subjectLatestScores = subjectStats.map(stat => stat.latest).filter((score): score is number => score !== undefined);
  const averageLatest = averageScore(subjectLatestScores);
  const personalLowestScore = lowestRecentScore(subjectStats.flatMap(stat => stat.latest === undefined || stat.latestCompletedAt === undefined
    ? []
    : [{ percentage: stat.latest, completedAt: stat.latestCompletedAt, subjectName: stat.subject.name }]));
  const personalLowest = personalLowestScore?.percentage;
  const personalLowestSubject = personalLowestScore?.subjectName;
  const currentSubject = session.view.page === 'subject' ? session.view.subject : undefined;
  const currentFlashcardSubject = view.page === 'flashcards-subject' ? view.subject : undefined;
  const currentQuizState = currentSubject ? questionBank.getQuizState(currentSubject.id) : 'idle';
  const currentQuizError = currentSubject ? questionBank.getQuizError(currentSubject.id) : undefined;
  const currentQuizRecovery = currentSubject ? questionBank.getQuizRecovery(currentSubject.id) : undefined;
  const selectSubject = (subject: Subject) => {
    cancel();
    session.showSubject(subject);
    void questionBank.ensureQuizzes(subject.id).catch(() => undefined);
  };

  const progressForSubject = (subjectId: string) => quizProgressForSubject(
    questionBank,
    progressView,
    subjectId,
  );

  const requestQuizExit = (destination: QuizExitDestination) => {
    setExitDestination(destination);
    setExitOpen(true);
  };
  const closeExitDialog = () => {
    setExitOpen(false);
    setExitDestination('subject');
  };
  const requestReviewExit = (destination: QuizExitDestination) => {
    setReviewExitDestination(destination);
    setReviewExitOpen(true);
  };
  const closeReviewExitDialog = () => {
    setReviewExitOpen(false);
    setReviewExitDestination('subject');
  };
  const requestProgress = () => {
    if (session.view.page === 'quiz' || view.page === 'flashcards-study') return;
    cancel();
    flashcards.cancelLaunch();
    runtimeFlashcardBank.cancelAll();
    session.cancelPendingResume();
    if (session.view.page === 'quiz-review') {
      openProgressAfterReviewExit.current = true;
      requestReviewExit('dashboard');
      return;
    }
    onProgress();
  };
  const handleNavigation = (section: LearnerSection) => {
    cancel();
    flashcards.cancelLaunch();
    runtimeFlashcardBank.cancelAll();
    const destination = section === 'quizzes' ? 'dashboard' : 'flashcards';
    if (session.view.page === 'quiz') {
      if (destination === 'flashcards') { flashcards.showDashboard(); void loadRuntimeFlashcardSubjects().catch(() => undefined); }
      requestQuizExit(destination);
    }
    else if (session.view.page === 'quiz-review') {
      if (destination === 'flashcards') { flashcards.showDashboard(); void loadRuntimeFlashcardSubjects().catch(() => undefined); }
      requestReviewExit(destination);
    }
    else if (section === 'quizzes') {
      if (view.page === 'flashcards-study' && !flashcards.saveAndExit()) return;
      flashcards.showDashboard();
      session.showDashboard();
    } else {
      if (view.page === 'flashcards-study' && !flashcards.saveAndExit()) return;
      flashcards.showDashboard();
      session.showFlashcards();
      void loadRuntimeFlashcardSubjects().catch(() => undefined);
    }
  };
  const leaveResults = () => {
    if (session.view.page === 'results') session.showQuizSubject(session.view.quiz);
  };

  const loadingLabel = view.page === 'quiz' ? 'Loading quiz…'
    : view.page === 'quiz-browse' ? 'Loading answers…'
      : view.page === 'quiz-review' ? 'Loading review…'
        : view.page === 'results' ? 'Loading results…'
          : view.page === 'flashcards-study' ? 'Loading deck…' : 'Loading…';

  const activeSection = view.page === 'flashcards' || view.page === 'flashcards-subject' || view.page === 'flashcards-study' ? 'flashcards' : 'quizzes';
  const activeStudy = session.view.page === 'quiz' || view.page === 'flashcards-study';
  const progressDisabledReason = activeStudy ? 'Save and leave your study session before opening progress.' : undefined;
  const currentPage = view.page === 'dashboard' ? 'quizzes' : view.page === 'flashcards' ? 'flashcards' : undefined;
  return <AppShell sidebar={<AppNavigationDrawer active={activeSection} currentPage={currentPage} onNavigate={handleNavigation} onProgress={progressDisabledReason ? undefined : requestProgress} progressDisabledReason={progressDisabledReason} />} busy={screenLoading}>
    {session.persistenceError && <Container maxWidth="md" sx={{ pt: 2 }}><Alert severity="error" onClose={session.clearPersistenceError}>{session.persistenceError}</Alert></Container>}
    {activeSection === 'flashcards' && view.page !== 'flashcards-study' && flashcards.persistenceError && <Container maxWidth="md" sx={{ pt: 2 }}><Alert severity="error">{flashcards.persistenceError}</Alert></Container>}
    {currentSubject && loadingQuizIds.size > 0 && <LinearProgress aria-label="Loading quiz questions" />}
    {currentFlashcardSubject && flashcards.loadingDeckId && <LinearProgress aria-label="Loading flashcard deck" />}
    <ScreenTransition screenId={screenIdentity(view)}>
    <ScreenLoadBoundary key={screenIdentity(view)} loadingLabel={loadingLabel} onLoadingChange={setScreenLoading}>
    {session.view.page === 'dashboard' && <DashboardScreen attempts={progressSnapshot.completed} subjectStats={subjectStats} averageLatest={averageLatest} personalLowest={personalLowest} personalLowestSubject={personalLowestSubject} loading={catalogState === 'idle' || catalogState === 'loading'} retrying={catalogState === 'retrying'} statsLoading={catalogState === 'idle' || catalogState === 'loading' || catalogState === 'retrying'} activeAttempts={Object.keys(progressSnapshot.active).length > 0} error={catalogState === 'error' ? catalogError : undefined} retryAt={questionBank.getCatalogRetryAt()} onRetry={() => {
      if (catalogError instanceof ContentLoadError && catalogError.kind === 'revision') { window.location.reload(); return; }
      if (catalogState === 'retrying') questionBank.retryCatalogNow();
      return questionBank.ensureSubjects().then(() => undefined, () => undefined);
    }} onSelectSubject={selectSubject} />}
    {view.page === 'flashcards' && <FlashcardsDashboardScreen
      subjects={flashcardDashboardData}
      activeSubjects={activeFlashcardSubjectCards}
      progress={flashcards.progress}
      progressError={flashcards.persistenceError}
      loading={runtimeFlashcardBank.getState('subjects') === 'idle' || runtimeFlashcardBank.getState('subjects') === 'loading'}
      error={runtimeFlashcardBank.getError('subjects')}
      onRetry={() => loadRuntimeFlashcardSubjects().then(() => undefined, () => undefined)}
      onSelectSubject={subject => {
        if (currentFlashcardSubject) runtimeFlashcardBank.cancel(`catalog:${currentFlashcardSubject.id}`);
        flashcards.showSubject(subject);
        void runtimeFlashcardBank.ensureSubjectCatalog(subject.id).catch(() => undefined);
      }}
    />}
    {currentFlashcardSubject && <FlashcardSubjectScreen
      subject={currentFlashcardSubject}
      catalog={runtimeFlashcardBank.getSubjectCatalog(currentFlashcardSubject.id)}
      checkpoints={flashcards.progress.checkpoints}
      completionCounts={flashcards.progress.completionCounts}
      loading={['idle', 'loading'].includes(runtimeFlashcardBank.getState(`catalog:${currentFlashcardSubject.id}`))}
      error={runtimeFlashcardBank.getError(`catalog:${currentFlashcardSubject.id}`)}
      loadingDeckId={flashcards.loadingDeckId}
      onRetry={() => {
        const error = runtimeFlashcardBank.getError(`catalog:${currentFlashcardSubject.id}`);
        if (error instanceof ContentLoadError && error.kind === 'revision') { window.location.reload(); return; }
        return runtimeFlashcardBank.ensureSubjectCatalog(currentFlashcardSubject.id).then(() => undefined, () => undefined);
      }}
      onBack={() => { runtimeFlashcardBank.cancel(`catalog:${currentFlashcardSubject.id}`); flashcards.showDashboard(); }}
      onSelectDeck={deck => { void flashcards.launchDeck(deck, currentFlashcardSubject); }}
      onPrepareDeck={deck => { void runtimeFlashcardBank.ensureCards(deck.id).catch(() => undefined); }}
    />}
    {currentSubject && <SubjectScreen subject={currentSubject} topics={questionBank.listTopics(currentSubject.id)} progress={progressForSubject(currentSubject.id)} loadingQuizIds={loadingQuizIds} loading={currentQuizState === 'idle' || currentQuizState === 'loading'} retrying={currentQuizState === 'retrying'} recovery={currentQuizRecovery} error={currentQuizError} onRetry={() => {
      if (currentQuizError instanceof ContentLoadError && currentQuizError.kind === 'revision') { window.location.reload(); return; }
      if (currentQuizRecovery?.busy) return;
      if (currentQuizState === 'retrying') questionBank.retryQuizNow(currentSubject.id);
      return questionBank.ensureQuizzes(currentSubject.id).then(() => undefined, () => undefined);
    }} onBack={() => { cancel(); session.showDashboard(); }} onResumeQuiz={quiz => { preloadQuizScreen(); launch(quiz, () => session.resumeQuiz(quiz)); }} onStartQuiz={(quiz, mode) => { preloadQuizScreen(); launch(quiz, () => session.startQuiz(quiz, mode)); }} onBrowseQuiz={quiz => { preloadBrowseScreen(); launch(quiz, () => session.browseQuiz(quiz)); }} onPrepareQuiz={quiz => { preloadQuizScreen(); void questionBank.ensureQuestions(quiz.id).catch(() => undefined); }} />}
    {view.page === 'quiz' && <QuizScreen {...view} questions={questionBank.listQuestions(view.quiz.id)} onCheckpoint={session.checkpoint} onFinish={session.finishQuiz} onRequestExit={() => requestQuizExit('subject')} />}
    {view.page === 'quiz-browse' && <QuizBrowseScreen {...view} questions={questionBank.listQuestions(view.quiz.id)} onNavigate={session.navigateBrowse} onDone={session.leaveBrowse} />}
    {view.page === 'quiz-review' && <QuizReviewScreen {...view} questions={questionBank.listQuestions(view.quiz.id)} onNavigate={session.navigateReview} onRequestExit={() => requestReviewExit('subject')} />}
    {view.page === 'results' && <ResultsScreen {...view} questions={questionBank.listQuestions(view.quiz.id)} onBack={leaveResults} onReview={() => { preloadReviewScreen(); session.reviewResults(); }} />}
    {view.page === 'flashcards-study' && <FlashcardStudyScreen {...view} cards={runtimeFlashcardBank.listCards(view.deck.id)} openedCardIds={flashcards.openedCardIds} flaggedCardIds={flashcards.flaggedCardIds} persistenceError={flashcards.persistenceError} onReveal={flashcards.toggleReveal} onToggleFlag={flashcards.toggleFlag} onNavigate={flashcards.navigateTo} onPrevious={flashcards.previous} onNext={flashcards.next} onSaveAndExit={flashcards.saveAndExit} onFinish={flashcards.finish} />}
    </ScreenLoadBoundary>
    </ScreenTransition>
    <ExitQuizDialog open={exitOpen} onClose={closeExitDialog} onLeave={() => { session.leaveQuiz(exitDestination); closeExitDialog(); }} onAbort={() => { session.abortQuiz(exitDestination); closeExitDialog(); }} />
    <LeaveReviewDialog open={reviewExitOpen} onClose={() => { openProgressAfterReviewExit.current = false; closeReviewExitDialog(); }} onLeave={() => {
      session.leaveReview(reviewExitDestination);
      const openProgress = openProgressAfterReviewExit.current;
      openProgressAfterReviewExit.current = false;
      closeReviewExitDialog();
      if (openProgress) { session.showDashboard(); onProgress(); }
    }} />
    <ResumeContentDialog open={Boolean(session.pendingResume)} onCancel={() => { cancel(); session.cancelPendingResume(); }} onRestart={() => { const pending = session.pendingResume; if (pending) launch(pending.quiz, session.restartPendingResume); }} />
    <Dialog open={Boolean(flashcards.pendingRestart)} onClose={flashcards.cancelRestart} aria-labelledby="flashcard-restart-title">
      <DialogTitle id="flashcard-restart-title">Restart this deck?</DialogTitle>
      <DialogContent>{flashcards.pendingRestart?.reason === 'changed-content'
        ? 'The cards in this deck changed since you last studied it. Restarting will save your position at the first card.'
        : 'Your saved card is no longer in this deck. Restarting will save your position at the first card.'}</DialogContent>
      <DialogActions><Button onClick={flashcards.cancelRestart}>Keep saved position</Button><Button variant="contained" onClick={flashcards.confirmRestart}>Restart deck</Button></DialogActions>
    </Dialog>

  </AppShell>;
}

export default function App() {
  const backup = useProgressBackup();
  return <ToastProvider><LearnerApp onProgress={backup.show} /><ProgressBackupDialog controller={backup} /></ToastProvider>;
}
