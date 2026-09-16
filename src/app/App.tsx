import { useMemo, useState } from 'react';
import { Alert, Box, Container } from '@mui/material';
import { explanationFor } from '../content/explanationCatalog';
import { questionBank, questions } from '../content/questionBank';
import { LocalAttemptRepository } from '../persistence/localRepository';
import { questionIndexFor } from '../domain/quizEngine';
import type { Quiz } from '../domain/types';
import { AppHeader } from './components/AppHeader';
import { ExitQuizDialog } from './components/quiz/ExitQuizDialog';
import { subjectForQuiz } from './navigation';
import { DashboardScreen, type SubjectStat } from './screens/DashboardScreen';
import { QuizScreen } from './screens/QuizScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SetupScreen } from './screens/SetupScreen';
import { SubjectScreen, type QuizProgress } from './screens/SubjectScreen';
import { useQuizSession } from './session/useQuizSession';

const attemptRepository = new LocalAttemptRepository();

function ResultReviewWarning({ quiz }: { quiz: Quiz }) {
  const count = questionBank.listQuestions(quiz.id).filter(question => explanationFor(question)?.answerReviewNote).length;
  if (!count) return null;
  return <Container maxWidth="md" sx={{ pt: 4 }}><Alert severity="warning">This score uses {count} source answer {count === 1 ? 'key' : 'keys'} under review. Interpret the result with that in mind.</Alert></Container>;
}

export default function App() {
  const session = useQuizSession(questionBank, attemptRepository);
  const [exitOpen, setExitOpen] = useState(false);
  const subjectStats = useMemo<SubjectStat[]>(() => questionBank.listSubjects().map(subject => {
    const subjectAttempts = session.completedAttempts.filter(attempt => attempt.subjectId === subject.id);
    return {
      subject,
      quizCount: questionBank.listQuizzes(subject.id).length,
      best: subjectAttempts.length ? Math.max(...subjectAttempts.map(attempt => attempt.score.percentage)) : undefined,
    };
  }), [session.completedAttempts]);

  const progressForSubject = (subjectId: string): QuizProgress[] => questionBank.listQuizzes(subjectId).map(quiz => {
    const active = attemptRepository.getActive(quiz.id);
    const questionIds = questionBank.listQuestions(quiz.id);
    return {
      quiz,
      active,
      completionCount: attemptRepository.completionCount(quiz.id),
      currentQuestion: active ? questionIndexFor(questionIds, active.currentQuestionId) + 1 : undefined,
    };
  });

  const handleHeaderNavigation = () => {
    if (session.view.page === 'quiz') setExitOpen(true);
    else session.showDashboard();
  };
  const leaveSetup = () => {
    if (session.view.page === 'setup') session.showQuizSubject(session.view.quiz);
  };
  const leaveResults = () => {
    if (session.view.page === 'results') session.showQuizSubject(session.view.quiz);
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <AppHeader onNavigateHome={handleHeaderNavigation} />
    {session.view.page === 'dashboard' && <DashboardScreen attempts={session.completedAttempts} subjectStats={subjectStats} onSelectSubject={session.showSubject} />}
    {session.view.page === 'subject' && <SubjectScreen subject={session.view.subject} progress={progressForSubject(session.view.subject.id)} onBack={session.showDashboard} onOpenQuiz={session.openQuiz} />}
    {session.view.page === 'setup' && <SetupScreen subject={subjectForQuiz(questionBank.listSubjects(), session.view.quiz)} quiz={session.view.quiz} onBack={leaveSetup} onStart={session.startQuiz} />}
    {session.view.page === 'quiz' && <QuizScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onCheckpoint={session.checkpoint} onFinish={session.finishQuiz} onRequestExit={() => setExitOpen(true)} />}
    {session.view.page === 'results' && <><ResultReviewWarning quiz={session.view.quiz} /><ResultsScreen {...session.view} questions={questions} onBack={leaveResults} /></>}
    <ExitQuizDialog open={exitOpen} onClose={() => setExitOpen(false)} onLeave={() => { session.leaveQuiz(); setExitOpen(false); }} onAbort={() => { session.abortQuiz(); setExitOpen(false); }} />
  </Box>;
}
