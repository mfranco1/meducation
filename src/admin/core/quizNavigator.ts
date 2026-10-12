import type { StoredQuestionBank } from '../../content/schema/schema';

export const ADMIN_PAGE_SIZE = 25;

export function selectQuizNavigatorPage(
  bank: StoredQuestionBank,
  subjectId: string | undefined,
  quizId: string | undefined,
  query: string,
  page: number,
) {
  const quizzes = bank.quizzes.filter((quiz) => !subjectId || quiz.subjectId === subjectId);
  const quizIds = new Set(quizzes.map((quiz) => quiz.id));
  const positions = new Map<string, number>();
  const items = bank.questions
    .map((question) => {
      const position = (positions.get(question.quizId) ?? 0) + 1;
      positions.set(question.quizId, position);
      return { question, position };
    })
    .filter(({ question }) => quizId ? question.quizId === quizId : quizIds.has(question.quizId));
  const normalized = query.trim().toLocaleLowerCase();
  const matches = items.filter(({ question }) => !normalized || `${question.id} ${question.stem}`.toLocaleLowerCase().includes(normalized));
  const pageCount = Math.max(1, Math.ceil(matches.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const visible = matches.slice(safePage * ADMIN_PAGE_SIZE, (safePage + 1) * ADMIN_PAGE_SIZE);
  return {
    quizzes,
    matches,
    visible,
    page: safePage,
    pageCount,
    rangeStart: matches.length ? safePage * ADMIN_PAGE_SIZE + 1 : 0,
    rangeEnd: Math.min(matches.length, (safePage + 1) * ADMIN_PAGE_SIZE),
  };
}
