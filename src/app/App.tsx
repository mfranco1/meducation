import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Box, Container, LinearProgress } from '@mui/material';
import { ContentLoadError, loadRuntimeContent, runtimeQuestionBank } from '../content/runtimeQuestionBank';
import { LocalAttemptRepository } from '../persistence/localRepository';
import { averageScore, lowestRecentScore } from '../analytics/analytics';
import type { Quiz, Subject } from '../domain/types';
import { AppHeader } from './components/AppHeader';
import { ScreenTransition } from './components/ScreenTransition';
import { ExitQuizDialog } from './components/quiz/ExitQuizDialog';
import type { SubjectStat } from './progress';
import { quizProgressForSubject, subjectStatsFor } from './progress';
import { screenIdentity } from './navigation';
import { DashboardScreen } from './screens/DashboardScreen';
import { QuizScreen } from './screens/QuizScreen';
import { QuizBrowseScreen } from './screens/QuizBrowseScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SubjectScreen } from './screens/SubjectScreen';
import { useQuizSession, type QuizExitDestination } from './session/useQuizSession';

const attemptRepository = new LocalAttemptRepository();

function ResultReviewWarning({ quiz }: { quiz: Quiz }) {
  const count = runtimeQuestionBank.listQuestions(quiz.id).filter(question => question.rationaleMeta?.answerReviewNote).length;
  if (!count) return null;
  return <Container maxWidth="md" sx={{ pt: 4 }}><Alert severity="warning">This score uses {count} source answer {count === 1 ? 'key' : 'keys'} under review. Interpret the result with that in mind.</Alert></Container>;
}

export default function App() {
  const questionBank = runtimeQuestionBank;
  const contentSnapshotVersion = useSyncExternalStore(questionBank.subscribe, questionBank.getSnapshot);
  useEffect(() => { void loadRuntimeContent().catch(() => undefined); }, []);
  const session = useQuizSession(questionBank, attemptRepository);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitDestination, setExitDestination] = useState<QuizExitDestination>('subject');
  const [contentError, setContentError] = useState<Error>();
  const [retryContent, setRetryContent] = useState<() => void>(() => () => undefined);
  const [loadingQuizIds, setLoadingQuizIds] = useState<Set<string>>(() => new Set());
  const contentActionsInFlight = useRef(new Set<string>());
  const navigationGeneration = useRef(0);
  const summaries = questionBank.listSubjectSummaries();
  const catalogState = questionBank.getCatalogState();
  const catalogError = questionBank.getCatalogError();
  const subjectStats = useMemo<SubjectStat[]>(
    () => subjectStatsFor(questionBank, attemptRepository, session.completedAttempts, summaries),
    [questionBank, session.completedAttempts, session.view.page, contentSnapshotVersion],
  );
  const subjectLatestScores = subjectStats.map(stat => stat.latest).filter((score): score is number => score !== undefined);
  const averageLatest = averageScore(subjectLatestScores);
  const personalLowestScore = lowestRecentScore(subjectStats.flatMap(stat => stat.latest === undefined || stat.latestCompletedAt === undefined
    ? []
    : [{ percentage: stat.latest, completedAt: stat.latestCompletedAt, subjectName: stat.subject.name }]));
  const personalLowest = personalLowestScore?.percentage;
  const personalLowestSubject = personalLowestScore?.subjectName;
  const currentSubject = session.view.page === 'subject' ? session.view.subject : undefined;
  const cancelPendingQuestionLoads = () => questionBank.cancelQuestionLoads();

  const loadQuizContent = (quiz: Quiz, action: () => void) => {
    if (contentActionsInFlight.current.has(quiz.id)) return;
    const generation = navigationGeneration.current;
    contentActionsInFlight.current.add(quiz.id);
    setLoadingQuizIds(current => new Set(current).add(quiz.id));
    const run = () => {
      setContentError(undefined);
      void questionBank.ensureQuestions(quiz.id).then(() => { if (navigationGeneration.current === generation) action(); }).catch(error => {
        if (navigationGeneration.current !== generation) return;
        const failure = error instanceof Error ? error : new Error('Please try again or come back later.');
        setContentError(failure);
        setRetryContent(() => failure instanceof ContentLoadError && failure.kind === 'revision'
          ? () => window.location.reload()
          : () => loadQuizContent(quiz, action));
      }).finally(() => { contentActionsInFlight.current.delete(quiz.id); setLoadingQuizIds(current => { const next = new Set(current); next.delete(quiz.id); return next; }); });
    };
    run();
  };

  const selectSubject = (subject: Subject) => {
    navigationGeneration.current++;
    cancelPendingQuestionLoads();
    setContentError(undefined);
    session.showSubject(subject);
    void questionBank.ensureQuizzes(subject.id).catch(() => undefined);
  };

  const progressForSubject = (subjectId: string) => quizProgressForSubject(
    questionBank,
    attemptRepository,
    session.completedAttempts,
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
    navigationGeneration.current++;
    cancelPendingQuestionLoads();
    setContentError(undefined);
    if (session.view.page === 'quiz') requestQuizExit('dashboard');
    else if (session.view.page === 'quiz-browse') session.showDashboard();
    else session.showDashboard();
  };
  const leaveResults = () => {
    if (session.view.page === 'results') session.showQuizSubject(session.view.quiz);
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <AppHeader onNavigateHome={handleHeaderNavigation} />
    {currentSubject && loadingQuizIds.size > 0 && <LinearProgress aria-label="Loading quiz questions" />}
    <ScreenTransition screenId={screenIdentity(session.view)}>
    {session.view.page === 'dashboard' && <DashboardScreen attempts={session.completedAttempts} subjectStats={subjectStats} averageLatest={averageLatest} personalLowest={personalLowest} personalLowestSubject={personalLowestSubject} loading={catalogState === 'idle' || catalogState === 'loading'} retrying={catalogState === 'retrying'} statsLoading={catalogState === 'idle' || catalogState === 'loading' || catalogState === 'retrying'} activeAttempts={attemptRepository.hasActiveAttempts()} error={catalogState === 'error' ? catalogError : undefined} onRetry={() => void questionBank.ensureSubjects().catch(() => undefined)} onSelectSubject={selectSubject} />}
    {currentSubject && <SubjectScreen subject={currentSubject} progress={progressForSubject(currentSubject.id)} loadingQuizIds={loadingQuizIds} loading={questionBank.getQuizState(currentSubject.id) === 'idle' || questionBank.getQuizState(currentSubject.id) === 'loading'} retrying={questionBank.getQuizState(currentSubject.id) === 'retrying'} error={questionBank.getQuizError(currentSubject.id)} questionError={contentError} onRetry={() => questionBank.getQuizError(currentSubject.id) instanceof ContentLoadError && (questionBank.getQuizError(currentSubject.id) as ContentLoadError).kind === 'revision' ? window.location.reload() : void questionBank.ensureQuizzes(currentSubject.id).catch(() => undefined)} onRetryQuestions={retryContent} onBack={() => { navigationGeneration.current++; cancelPendingQuestionLoads(); setContentError(undefined); session.showDashboard(); }} onResumeQuiz={quiz => loadQuizContent(quiz, () => session.resumeQuiz(quiz))} onStartQuiz={(quiz, mode) => loadQuizContent(quiz, () => session.startQuiz(quiz, mode))} onBrowseQuiz={quiz => loadQuizContent(quiz, () => session.browseQuiz(quiz))} />}
    {session.view.page === 'quiz' && <QuizScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onCheckpoint={session.checkpoint} onFinish={session.finishQuiz} onRequestExit={() => requestQuizExit('subject')} />}
    {session.view.page === 'quiz-browse' && <QuizBrowseScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onNavigate={session.navigateBrowse} onDone={session.leaveBrowse} />}
    {session.view.page === 'results' && <><ResultReviewWarning quiz={session.view.quiz} /><ResultsScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onBack={leaveResults} /></>}
    </ScreenTransition>
    <ExitQuizDialog open={exitOpen} onClose={closeExitDialog} onLeave={() => { session.leaveQuiz(exitDestination); closeExitDialog(); }} onAbort={() => { session.abortQuiz(exitDestination); closeExitDialog(); }} />
  </Box>;
}
