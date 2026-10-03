import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Box, Container, LinearProgress } from '@mui/material';
import { loadRuntimeContent, runtimeQuestionBank } from '../content/runtimeQuestionBank';
import { ContentLoadError } from '../content/contentTransport';
import { LocalAttemptRepository } from '../persistence/localRepository';
import { averageScore, lowestRecentScore } from '../analytics/analytics';
import type { Quiz, Subject } from '../domain/types';
import { AppHeader } from './components/AppHeader';
import { ScreenTransition } from './components/ScreenTransition';
import { ScreenLoadBoundary } from './components/ScreenLoadBoundary';
import { ExitQuizDialog } from './components/quiz/ExitQuizDialog';
import { ResumeContentDialog } from './components/quiz/ResumeContentDialog';
import type { SubjectStat } from './progress';
import { createProgressView, quizProgressForSubject, subjectStatsFor } from './progress';
import { screenIdentity } from './navigation';
import { DashboardScreen } from './screens/DashboardScreen';
import { QuizScreen, QuizBrowseScreen, ResultsScreen, preloadBrowseScreen, preloadQuizScreen, preloadResultsScreen } from './lazyScreens';
import { SubjectScreen } from './screens/SubjectScreen';
import { useQuizSession, type QuizExitDestination } from './session/useQuizSession';
import { useQuizLaunch } from './session/useQuizLaunch';

const attemptRepository = new LocalAttemptRepository();

function ResultReviewWarning({ quiz }: { quiz: Quiz }) {
  const count = runtimeQuestionBank.listQuestions(quiz.id).filter(question => question.rationaleMeta?.answerReviewNote).length;
  if (!count) return null;
  return <Container maxWidth="md" sx={{ pt: 4 }}><Alert severity="warning">This score uses {count} source answer {count === 1 ? 'key' : 'keys'} under review. Interpret the result with that in mind.</Alert></Container>;
}

export default function App() {
  const questionBank = runtimeQuestionBank;
  const contentSnapshotVersion = useSyncExternalStore(questionBank.subscribe, questionBank.getSnapshot);
  const progressSnapshot = useSyncExternalStore(attemptRepository.subscribe, attemptRepository.getSnapshot);
  const progressView = useMemo(() => createProgressView(progressSnapshot), [progressSnapshot]);
  useEffect(() => { void loadRuntimeContent().catch(() => undefined); }, []);
  const session = useQuizSession(questionBank, attemptRepository);
  const { loadingQuizIds, contentError, retryContent, launch, cancel } = useQuizLaunch(questionBank);
  useEffect(() => { if (session.view.page === 'quiz') preloadResultsScreen(); }, [session.view.page]);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitDestination, setExitDestination] = useState<QuizExitDestination>('subject');
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
  const handleHeaderNavigation = () => {
    cancel();
    if (session.view.page === 'quiz') requestQuizExit('dashboard');
    else if (session.view.page === 'quiz-browse') session.showDashboard();
    else session.showDashboard();
  };
  const leaveResults = () => {
    if (session.view.page === 'results') session.showQuizSubject(session.view.quiz);
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <AppHeader onNavigateHome={handleHeaderNavigation} />
    {session.persistenceError && <Container maxWidth="md" sx={{ pt: 2 }}><Alert severity="error" onClose={session.clearPersistenceError}>{session.persistenceError}</Alert></Container>}
    {currentSubject && loadingQuizIds.size > 0 && <LinearProgress aria-label="Loading quiz questions" />}
    <ScreenTransition screenId={screenIdentity(session.view)}>
    <ScreenLoadBoundary key={screenIdentity(session.view)}>
    {session.view.page === 'dashboard' && <DashboardScreen attempts={progressSnapshot.completed} subjectStats={subjectStats} averageLatest={averageLatest} personalLowest={personalLowest} personalLowestSubject={personalLowestSubject} loading={catalogState === 'idle' || catalogState === 'loading'} retrying={catalogState === 'retrying'} statsLoading={catalogState === 'idle' || catalogState === 'loading' || catalogState === 'retrying'} activeAttempts={Object.keys(progressSnapshot.active).length > 0} error={catalogState === 'error' ? catalogError : undefined} onRetry={() => void questionBank.ensureSubjects().catch(() => undefined)} onSelectSubject={selectSubject} />}
    {currentSubject && <SubjectScreen subject={currentSubject} progress={progressForSubject(currentSubject.id)} loadingQuizIds={loadingQuizIds} loading={questionBank.getQuizState(currentSubject.id) === 'idle' || questionBank.getQuizState(currentSubject.id) === 'loading'} retrying={questionBank.getQuizState(currentSubject.id) === 'retrying'} error={questionBank.getQuizError(currentSubject.id)} questionError={contentError} onRetry={() => questionBank.getQuizError(currentSubject.id) instanceof ContentLoadError && (questionBank.getQuizError(currentSubject.id) as ContentLoadError).kind === 'revision' ? window.location.reload() : void questionBank.ensureQuizzes(currentSubject.id).catch(() => undefined)} onRetryQuestions={retryContent} onBack={() => { cancel(); session.showDashboard(); }} onResumeQuiz={quiz => { preloadQuizScreen(); launch(quiz, () => session.resumeQuiz(quiz)); }} onStartQuiz={(quiz, mode) => { preloadQuizScreen(); launch(quiz, () => session.startQuiz(quiz, mode)); }} onBrowseQuiz={quiz => { preloadBrowseScreen(); launch(quiz, () => session.browseQuiz(quiz)); }} />}
    {session.view.page === 'quiz' && <QuizScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onCheckpoint={session.checkpoint} onFinish={session.finishQuiz} onRequestExit={() => requestQuizExit('subject')} />}
    {session.view.page === 'quiz-browse' && <QuizBrowseScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onNavigate={session.navigateBrowse} onDone={session.leaveBrowse} />}
    {session.view.page === 'results' && <><ResultReviewWarning quiz={session.view.quiz} /><ResultsScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onBack={leaveResults} /></>}
    </ScreenLoadBoundary>
    </ScreenTransition>
    <ExitQuizDialog open={exitOpen} onClose={closeExitDialog} onLeave={() => { session.leaveQuiz(exitDestination); closeExitDialog(); }} onAbort={() => { session.abortQuiz(exitDestination); closeExitDialog(); }} />
    <ResumeContentDialog open={Boolean(session.pendingResume)} reason={session.pendingResume?.reason} onCancel={session.cancelPendingResume} onRestart={session.restartPendingResume} />
  </Box>;
}
