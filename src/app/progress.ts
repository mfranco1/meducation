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
  membership?: { id: string; quizIds: string[] }[],
): SubjectStat[] {
  const quizIdsBySubject = new Map(membership?.map(item => [item.id, item.quizIds]));
  return questionBank.listSubjects().map(subject => {
    const quizIds = quizIdsBySubject?.get(subject.id) ?? questionBank.listQuizzes(subject.id).map(quiz => quiz.id);
    const activeQuizIds = quizIds.filter(quizId => attempts.getActive(quizId) !== undefined);
    const recentQuizScores = quizIds
      .map(quizId => attempts.latestScore(quizId))
      .filter((score): score is RecentScore => score !== undefined);
    const latest = mostRecentScore(recentQuizScores);
    const subjectScores = completedAttempts
      .filter(attempt => attempt.subjectId === subject.id)
      .map(attempt => ({ percentage: attempt.score.percentage, completedAt: attempt.completedAt }));
    return {
      subject,
      quizCount: quizIds.length,
      activeQuizCount: activeQuizIds.length,
      latestActiveAt: activeQuizIds
        .map(quizId => attempts.latestActivityAt(quizId))
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
      currentQuestion: active
        ? quiz.questionIds
          ? Math.max(0, quiz.questionIds.indexOf(active.currentQuestionId ?? '')) + 1
          : questionIndexFor(questionBank.listQuestions(quiz.id), active.currentQuestionId) + 1
        : undefined,
    };
  });
  return sortQuizProgressByRecentActivity(progress, quizId => attempts.latestActivityAt(quizId));
}
