import { mostRecentScore, scoreTrend } from '../analytics/analytics';
import type { Attempt, AttemptRepository, CompletedAttempt, Quiz, QuizRepository, RecentScore, Subject } from '../domain/types';
import { questionIndexFor } from '../domain/quizEngine';
import { sortQuizProgressByRecentActivity } from './quizProgress';

export interface QuizProgress {
  quiz: Quiz;
  active?: Attempt;
  completionCount: number;
  latestScore?: number;
  trend?: ReturnType<typeof scoreTrend>;
  currentQuestion?: number;
}

export interface SubjectStat {
  subject: Subject;
  quizCount: number;
  activeQuizCount: number;
  latestActiveAt?: string;
  latest?: number;
  latestCompletedAt?: string;
  trend?: ReturnType<typeof scoreTrend>;
}

function scoresForQuiz(completedAttempts: CompletedAttempt[], quizId: string): RecentScore[] {
  return completedAttempts
    .filter(attempt => attempt.quizId === quizId)
    .map(attempt => ({ percentage: attempt.score.percentage, completedAt: attempt.completedAt }));
}

function trendFor(latest: RecentScore | undefined, scores: RecentScore[]) {
  const latestAttempt = mostRecentScore(scores);
  return latest && latestAttempt && latest.completedAt === latestAttempt.completedAt && latest.percentage === latestAttempt.percentage
    ? scoreTrend(scores)
    : undefined;
}

export function subjectStatsFor(
  questionBank: QuizRepository,
  attempts: AttemptRepository,
  completedAttempts: CompletedAttempt[],
): SubjectStat[] {
  return questionBank.listSubjects().map(subject => {
    const quizzes = questionBank.listQuizzes(subject.id);
    const activeQuizzes = quizzes.filter(quiz => attempts.getActive(quiz.id) !== undefined);
    const recentQuizScores = quizzes
      .map(quiz => attempts.latestScore(quiz.id))
      .filter((score): score is RecentScore => score !== undefined);
    const latest = mostRecentScore(recentQuizScores);
    const subjectScores = completedAttempts
      .filter(attempt => attempt.subjectId === subject.id)
      .map(attempt => ({ percentage: attempt.score.percentage, completedAt: attempt.completedAt }));
    return {
      subject,
      quizCount: quizzes.length,
      activeQuizCount: activeQuizzes.length,
      latestActiveAt: activeQuizzes
        .map(quiz => attempts.latestActivityAt(quiz.id))
        .filter((at): at is string => at !== undefined)
        .sort()
        .at(-1),
      latest: latest?.percentage,
      latestCompletedAt: latest?.completedAt,
      trend: trendFor(latest, subjectScores),
    };
  });
}

export function quizProgressForSubject(
  questionBank: QuizRepository,
  attempts: AttemptRepository,
  completedAttempts: CompletedAttempt[],
  subjectId: string,
): QuizProgress[] {
  const progress = questionBank.listQuizzes(subjectId).map(quiz => {
    const active = attempts.getActive(quiz.id);
    const latest = attempts.latestScore(quiz.id);
    const scores = scoresForQuiz(completedAttempts, quiz.id);
    return {
      quiz,
      active,
      completionCount: attempts.completionCount(quiz.id),
      latestScore: latest?.percentage,
      trend: trendFor(latest, scores),
      currentQuestion: active ? questionIndexFor(questionBank.listQuestions(quiz.id), active.currentQuestionId) + 1 : undefined,
    };
  });
  return sortQuizProgressByRecentActivity(progress, quizId => attempts.latestActivityAt(quizId));
}
