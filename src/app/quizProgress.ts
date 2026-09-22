import type { QuizProgress } from './screens/SubjectScreen';

export function sortQuizProgressByRecentActivity(progress: QuizProgress[], latestActivityAt: (quizId: string) => string | undefined): QuizProgress[] {
  return progress
    .map((item, index) => ({ item, index, activityAt: latestActivityAt(item.quiz.id) }))
    .sort((left, right) => (right.activityAt ?? '').localeCompare(left.activityAt ?? '') || left.index - right.index)
    .map(({ item }) => item);
}
