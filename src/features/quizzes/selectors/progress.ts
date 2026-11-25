import { MIXED_TEST_ID, subjectTestId } from '../../../domain/generatedTests';
import { averageScore, lowestRecentScore, mostRecentScore, scoreTrend } from '../../../domain/scores';
import type { Attempt, Quiz, QuizRepository, RecentScore, Subject } from '../../../domain/types';
import type { ProgressState } from '../../../persistence/progressCodec';

export interface QuizProgress {
  quiz: Quiz;
  active?: Attempt;
  completionCount: number;
  latestScore?: number;
  trend?: ReturnType<typeof scoreTrend>;
  answeredCount?: number;
  activityAt?: string;
}

export interface SubjectStat {
  subject: Subject;
  quizCount: number;
  activeQuizCount: number;
  latestActiveAt?: string;
  /** Questions answered in the most recently active quiz. `total` is unknown until its quiz catalog loads. */
  latestActive?: { answered: number; total?: number };
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
  return { snapshot, scoresByQuiz, scoresBySubject, activityAt: snapshot.activity };
}

const answeredCount = (attempt: Attempt) =>
  Object.values(attempt.responses).filter((response) => response.selectedChoiceId).length;

function trendFor(latest: RecentScore | undefined, scores: RecentScore[]) {
  const latestAttempt = mostRecentScore(scores);
  return latest &&
    latestAttempt &&
    latest.completedAt === latestAttempt.completedAt &&
    latest.percentage === latestAttempt.percentage
    ? scoreTrend(scores)
    : undefined;
}

export function subjectStatsFor(
  questionBank: QuizRepository,
  progress: ProgressView,
  membership?: { id: string; quizIds: string[] }[],
): SubjectStat[] {
  const quizIdsBySubject = new Map(membership?.map((item) => [item.id, item.quizIds]));
  return questionBank.listSubjects().map((subject) => {
    const quizzes = questionBank.listQuizzes(subject.id);
    const quizIds = quizIdsBySubject?.get(subject.id) ?? quizzes.map((quiz) => quiz.id);
    // The Subject Test counts toward activity and scores, but not toward the quiz counts.
    const studyIds = [...quizIds, subjectTestId(subject.id)];
    const activeQuizIds = studyIds.filter((quizId) => progress.snapshot.active[quizId] !== undefined);
    const latestScore = (quizId: string) => progress.snapshot.latestScores[quizId] ?? [];
    const latest = mostRecentScore(studyIds.flatMap(latestScore));
    const subjectScores = progress.scoresBySubject.get(subject.id) ?? [];
    const activityAt = (quizId: string) => progress.activityAt[quizId] ?? '';
    const latestActiveId = activeQuizIds.reduce<string | undefined>(
      (latestId, quizId) => (latestId === undefined || activityAt(quizId) > activityAt(latestId) ? quizId : latestId),
      undefined,
    );
    const latestAttempt = latestActiveId === undefined ? undefined : progress.snapshot.active[latestActiveId];
    return {
      subject,
      quizCount: quizIds.length,
      activeQuizCount: activeQuizIds.length,
      latestActiveAt: latestActiveId === undefined ? undefined : progress.activityAt[latestActiveId],
      latestActive: latestAttempt && {
        answered: answeredCount(latestAttempt),
        total: latestAttempt.questionIds?.length ?? quizzes.find((quiz) => quiz.id === latestActiveId)?.questionCount,
      },
      latest: latest?.percentage,
      latestCompletedAt: latest?.completedAt,
      trend: trendFor(latest, subjectScores),
    };
  });
}

export function quizProgressFor(progressView: ProgressView, quiz: Quiz): QuizProgress {
  const active = progressView.snapshot.active[quiz.id];
  const latest = progressView.snapshot.latestScores[quiz.id];
  const scores = progressView.scoresByQuiz.get(quiz.id) ?? [];
  return {
    quiz,
    active,
    completionCount: progressView.snapshot.completionCounts[quiz.id] ?? 0,
    latestScore: latest?.percentage,
    trend: trendFor(latest, scores),
    activityAt: progressView.activityAt[quiz.id],
    answeredCount: active && answeredCount(active),
  };
}

export function quizProgressForSubject(
  questionBank: QuizRepository,
  progressView: ProgressView,
  subjectId: string,
): QuizProgress[] {
  return questionBank.listQuizzes(subjectId).map((quiz) => quizProgressFor(progressView, quiz));
}

/** Returns active subjects in most-recent active-quiz order, preserving catalog order for ties. */
export function activeSubjectStats(subjectStats: SubjectStat[]): SubjectStat[] {
  return subjectStats
    .map((stat, index) => ({ stat, index }))
    .filter(({ stat }) => stat.activeQuizCount > 0)
    .sort(
      (left, right) =>
        (right.stat.latestActiveAt ?? '').localeCompare(left.stat.latestActiveAt ?? '') || left.index - right.index,
    )
    .map(({ stat }) => stat);
}

/** Average and lowest of each subject's latest score and the Mixed Test's latest score. */
export function dashboardScoreSummary(subjectStats: SubjectStat[], progress?: ProgressView) {
  const mixed = progress?.snapshot.latestScores[MIXED_TEST_ID];
  const latestScores = [
    ...subjectStats.flatMap((stat) =>
      stat.latest === undefined || stat.latestCompletedAt === undefined
        ? []
        : [{ percentage: stat.latest, completedAt: stat.latestCompletedAt, subjectName: stat.subject.name }],
    ),
    ...(mixed ? [{ ...mixed, subjectName: 'Mixed Test' }] : []),
  ];
  const averageLatest = averageScore(latestScores.map((score) => score.percentage));
  const lowest = lowestRecentScore(latestScores);
  return { averageLatest, personalLowest: lowest?.percentage, personalLowestSubject: lowest?.subjectName };
}
