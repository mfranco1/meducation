import { useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Container } from '@mui/material';
import { runtimeQuestionBank } from '../content/runtimeQuestionBank';
import { LocalAttemptRepository } from '../persistence/localRepository';
import { averageScore, lowestRecentScore } from '../analytics/analytics';
import type { Quiz } from '../domain/types';
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
  const session = useQuizSession(questionBank, attemptRepository);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitDestination, setExitDestination] = useState<QuizExitDestination>('subject');
  const [contentError, setContentError] = useState<string>();
  const [retryContent, setRetryContent] = useState<() => void>(() => () => undefined);
  const contentActionsInFlight = useRef(new Set<string>());
  const subjectStats = useMemo<SubjectStat[]>(
    () => subjectStatsFor(questionBank, attemptRepository, session.completedAttempts),
    [session.completedAttempts, session.view.page],
  );
  const subjectLatestScores = subjectStats.map(stat => stat.latest).filter((score): score is number => score !== undefined);
  const averageLatest = averageScore(subjectLatestScores);
  const personalLowestScore = lowestRecentScore(subjectStats.flatMap(stat => stat.latest === undefined || stat.latestCompletedAt === undefined
    ? []
    : [{ percentage: stat.latest, completedAt: stat.latestCompletedAt, subjectName: stat.subject.name }]));
  const personalLowest = personalLowestScore?.percentage;
  const personalLowestSubject = personalLowestScore?.subjectName;

  const loadQuizContent = (quiz: Quiz, action: () => void) => {
    if (contentActionsInFlight.current.has(quiz.id)) return;
    contentActionsInFlight.current.add(quiz.id);
    const run = () => {
      setContentError(undefined);
      void questionBank.ensureQuestions(quiz.id).then(action).catch(error => {
        const message = error instanceof Error ? error.message : 'Quiz content could not be loaded.';
        setContentError(message);
        setRetryContent(() => message.includes('Reload the app')
          ? () => window.location.reload()
          : () => loadQuizContent(quiz, action));
      }).finally(() => contentActionsInFlight.current.delete(quiz.id));
    };
    run();
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
    if (session.view.page === 'quiz') requestQuizExit('dashboard');
    else if (session.view.page === 'quiz-browse') session.showDashboard();
    else session.showDashboard();
  };
  const leaveResults = () => {
    if (session.view.page === 'results') session.showQuizSubject(session.view.quiz);
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <AppHeader onNavigateHome={handleHeaderNavigation} />
    {contentError && <Container maxWidth="md" sx={{ pt: 2 }}><Alert severity="error" action={<Button color="inherit" size="small" onClick={retryContent}>{contentError.includes('Reload the app') ? 'Reload' : 'Retry'}</Button>}>{contentError}</Alert></Container>}
    <ScreenTransition screenId={screenIdentity(session.view)}>
    {session.view.page === 'dashboard' && <DashboardScreen attempts={session.completedAttempts} subjectStats={subjectStats} averageLatest={averageLatest} personalLowest={personalLowest} personalLowestSubject={personalLowestSubject} onSelectSubject={session.showSubject} />}
    {session.view.page === 'subject' && <SubjectScreen subject={session.view.subject} progress={progressForSubject(session.view.subject.id)} onBack={session.showDashboard} onResumeQuiz={quiz => loadQuizContent(quiz, () => session.resumeQuiz(quiz))} onStartQuiz={(quiz, mode) => loadQuizContent(quiz, () => session.startQuiz(quiz, mode))} onBrowseQuiz={quiz => loadQuizContent(quiz, () => session.browseQuiz(quiz))} />}
    {session.view.page === 'quiz' && <QuizScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onCheckpoint={session.checkpoint} onFinish={session.finishQuiz} onRequestExit={() => requestQuizExit('subject')} />}
    {session.view.page === 'quiz-browse' && <QuizBrowseScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onNavigate={session.navigateBrowse} onDone={session.leaveBrowse} />}
    {session.view.page === 'results' && <><ResultReviewWarning quiz={session.view.quiz} /><ResultsScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onBack={leaveResults} /></>}
    </ScreenTransition>
    <ExitQuizDialog open={exitOpen} onClose={closeExitDialog} onLeave={() => { session.leaveQuiz(exitDestination); closeExitDialog(); }} onAbort={() => { session.abortQuiz(exitDestination); closeExitDialog(); }} />
  </Box>;
}
