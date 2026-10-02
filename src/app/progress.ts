import { mostRecentScore, scoreTrend } from '../analytics/analytics';
import type { Attempt, Quiz, QuizRepository, RecentScore, Subject } from '../domain/types';
import type { ProgressState } from '../persistence/progressCodec';
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

export interface ProgressView {
  snapshot: ProgressState;
  scoresByQuiz: ReadonlyMap<string, RecentScore[]>;
  scoresBySubject: ReadonlyMap<string, RecentScore[]>;
  activityAt: Readonly<Record<string, string>>;
}

export function createProgressView(snapshot: ProgressState): ProgressView {
  const scoresByQuiz = new Map<string, RecentScore[]>();
  const scoresBySubject = new Map<string, RecentScore[]>();
  for (const attempt of snapshot.completed) {
    const score = { percentage: attempt.score.percentage, completedAt: attempt.completedAt };
    const quizScores = scoresByQuiz.get(attempt.quizId) ?? [];
    quizScores.push(score);
    scoresByQuiz.set(attempt.quizId, quizScores);
    const subjectScores = scoresBySubject.get(attempt.subjectId) ?? [];
    subjectScores.push(score);
    scoresBySubject.set(attempt.subjectId, subjectScores);
  }
  const activityAt = { ...snapshot.activity };
  for (const [quizId, attempt] of Object.entries(snapshot.active)) activityAt[quizId] ??= attempt.startedAt;
  for (const [quizId, latest] of Object.entries(snapshot.latestScores)) activityAt[quizId] ??= latest.completedAt;
  return { snapshot, scoresByQuiz, scoresBySubject, activityAt };
}

function trendFor(latest: RecentScore | undefined, scores: RecentScore[]) {
  const latestAttempt = mostRecentScore(scores);
  return latest && latestAttempt && latest.completedAt === latestAttempt.completedAt && latest.percentage === latestAttempt.percentage
    ? scoreTrend(scores)
    : undefined;
}

export function subjectStatsFor(
  questionBank: QuizRepository,
  progress: ProgressView,
  membership?: { id: string; quizIds: string[] }[],
): SubjectStat[] {
  const quizIdsBySubject = new Map(membership?.map(item => [item.id, item.quizIds]));
  return questionBank.listSubjects().map(subject => {
    const quizIds = quizIdsBySubject?.get(subject.id) ?? questionBank.listQuizzes(subject.id).map(quiz => quiz.id);
    const activeQuizIds = quizIds.filter(quizId => progress.snapshot.active[quizId] !== undefined);
    const recentQuizScores = quizIds
      .map(quizId => progress.snapshot.latestScores[quizId])
      .filter((score): score is RecentScore => score !== undefined);
    const latest = mostRecentScore(recentQuizScores);
    const subjectScores = progress.scoresBySubject.get(subject.id) ?? [];
    return {
      subject,
      quizCount: quizIds.length,
      activeQuizCount: activeQuizIds.length,
      latestActiveAt: activeQuizIds
        .map(quizId => progress.activityAt[quizId])
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
  progressView: ProgressView,
  subjectId: string,
): QuizProgress[] {
  const progress = questionBank.listQuizzes(subjectId).map(quiz => {
    const active = progressView.snapshot.active[quiz.id];
    const latest = progressView.snapshot.latestScores[quiz.id];
    const scores = progressView.scoresByQuiz.get(quiz.id) ?? [];
    return {
      quiz,
      active,
      completionCount: progressView.snapshot.completionCounts[quiz.id] ?? 0,
      latestScore: latest?.percentage,
      trend: trendFor(latest, scores),
      currentQuestion: active
        ? quiz.questionIds
          ? Math.max(0, quiz.questionIds.indexOf(active.currentQuestionId ?? '')) + 1
          : questionIndexFor(questionBank.listQuestions(quiz.id), active.currentQuestionId) + 1
        : undefined,
    };
  });
  return sortQuizProgressByRecentActivity(progress, quizId => progressView.activityAt[quizId]);
}
