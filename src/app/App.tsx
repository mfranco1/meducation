import { useMemo, useState } from 'react';
import { Alert, Box, Container } from '@mui/material';
import { questionBank, questions } from '../content/questionBank';
import { LocalAttemptRepository } from '../persistence/localRepository';
import { questionIndexFor } from '../domain/quizEngine';
import { averageScore, lowestRecentScore, mostRecentScore, scoreTrend } from '../analytics/analytics';
import type { Quiz, RecentScore } from '../domain/types';
import { AppHeader } from './components/AppHeader';
import { ExitQuizDialog } from './components/quiz/ExitQuizDialog';
import { DashboardScreen, type SubjectStat } from './screens/DashboardScreen';
import { QuizScreen } from './screens/QuizScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SubjectScreen, type QuizProgress } from './screens/SubjectScreen';
import { useQuizSession } from './session/useQuizSession';
import { sortQuizProgressByRecentActivity } from './quizProgress';

const attemptRepository = new LocalAttemptRepository();

function ResultReviewWarning({ quiz }: { quiz: Quiz }) {
  const count = questionBank.listQuestions(quiz.id).filter(question => question.rationaleMeta?.answerReviewNote).length;
  if (!count) return null;
  return <Container maxWidth="md" sx={{ pt: 4 }}><Alert severity="warning">This score uses {count} source answer {count === 1 ? 'key' : 'keys'} under review. Interpret the result with that in mind.</Alert></Container>;
}

export default function App() {
  const session = useQuizSession(questionBank, attemptRepository);
  const [exitOpen, setExitOpen] = useState(false);
  const subjectStats = useMemo<SubjectStat[]>(() => questionBank.listSubjects().map(subject => {
    const quizzes = questionBank.listQuizzes(subject.id);
    const activeQuizCount = quizzes.filter(quiz => attemptRepository.getActive(quiz.id) !== undefined).length;
    const recentQuizScores = quizzes.map(quiz => attemptRepository.latestScore(quiz.id)).filter((score): score is RecentScore => score !== undefined);
    const latest = mostRecentScore(recentQuizScores);
    const recentSubjectScores = session.completedAttempts
      .filter(attempt => attempt.subjectId === subject.id)
      .map(attempt => ({ percentage: attempt.score.percentage, completedAt: attempt.completedAt }));
    const latestAttempt = mostRecentScore(recentSubjectScores);
    return {
      subject,
      quizCount: quizzes.length,
      activeQuizCount,
      latest: latest?.percentage,
      latestCompletedAt: latest?.completedAt,
      trend: latest && latestAttempt && latest.completedAt === latestAttempt.completedAt && latest.percentage === latestAttempt.percentage
        ? scoreTrend(recentSubjectScores)
        : undefined,
    };
  }), [session.completedAttempts, session.view.page]);
  const subjectLatestScores = subjectStats.map(stat => stat.latest).filter((score): score is number => score !== undefined);
  const averageLatest = averageScore(subjectLatestScores);
  const personalLowestScore = lowestRecentScore(subjectStats.flatMap(stat => stat.latest === undefined || stat.latestCompletedAt === undefined
    ? []
    : [{ percentage: stat.latest, completedAt: stat.latestCompletedAt, subjectName: stat.subject.name }]));
  const personalLowest = personalLowestScore?.percentage;
  const personalLowestSubject = personalLowestScore?.subjectName;

  const progressForSubject = (subjectId: string): QuizProgress[] => sortQuizProgressByRecentActivity(questionBank.listQuizzes(subjectId)
    .map(quiz => {
      const active = attemptRepository.getActive(quiz.id);
      const questionIds = questionBank.listQuestions(quiz.id);
      return {
        quiz,
        active,
        completionCount: attemptRepository.completionCount(quiz.id),
        lowestScore: attemptRepository.lowestScore(quiz.id),
        latestScore: attemptRepository.latestScore(quiz.id)?.percentage,
        currentQuestion: active ? questionIndexFor(questionIds, active.currentQuestionId) + 1 : undefined,
      };
    }), quizId => attemptRepository.latestActivityAt(quizId));

  const handleHeaderNavigation = () => {
    if (session.view.page === 'quiz') setExitOpen(true);
    else session.showDashboard();
  };
  const leaveResults = () => {
    if (session.view.page === 'results') session.showQuizSubject(session.view.quiz);
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <AppHeader onNavigateHome={handleHeaderNavigation} />
    {session.view.page === 'dashboard' && <DashboardScreen attempts={session.completedAttempts} subjectStats={subjectStats} averageLatest={averageLatest} personalLowest={personalLowest} personalLowestSubject={personalLowestSubject} onSelectSubject={session.showSubject} />}
    {session.view.page === 'subject' && <SubjectScreen subject={session.view.subject} progress={progressForSubject(session.view.subject.id)} onBack={session.showDashboard} onResumeQuiz={session.resumeQuiz} onStartQuiz={session.startQuiz} />}
    {session.view.page === 'quiz' && <QuizScreen {...session.view} questions={questionBank.listQuestions(session.view.quiz.id)} onCheckpoint={session.checkpoint} onFinish={session.finishQuiz} onRequestExit={() => setExitOpen(true)} />}
    {session.view.page === 'results' && <><ResultReviewWarning quiz={session.view.quiz} /><ResultsScreen {...session.view} questions={questions} onBack={leaveResults} /></>}
    <ExitQuizDialog open={exitOpen} onClose={() => setExitOpen(false)} onLeave={() => { session.leaveQuiz(); setExitOpen(false); }} onAbort={() => { session.abortQuiz(); setExitOpen(false); }} />
  </Box>;
}
