import type { StoredFlashcard, StoredQuestionBank } from '../../content/schema/schema';

export const ADMIN_PAGE_SIZE = 25;

const matchesQuery = (text: string, query: string) => !query || text.toLocaleLowerCase().includes(query);

/** Clamps a stale page and returns the visible slice with its display range. */
function paginate<T>(matches: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(matches.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * ADMIN_PAGE_SIZE;
  return {
    matches,
    visible: matches.slice(start, start + ADMIN_PAGE_SIZE),
    page: safePage,
    pageCount,
    rangeStart: matches.length ? start + 1 : 0,
    rangeEnd: Math.min(matches.length, start + ADMIN_PAGE_SIZE),
  };
}

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
  const normalized = query.trim().toLocaleLowerCase();
  const matches = bank.questions
    .map((question) => {
      const position = (positions.get(question.quizId) ?? 0) + 1;
      positions.set(question.quizId, position);
      return { question, position };
    })
    .filter(({ question }) => (quizId ? question.quizId === quizId : quizIds.has(question.quizId)))
    .filter(({ question }) => matchesQuery(`${question.id} ${question.stem}`, normalized));
  return { quizzes, ...paginate(matches, page) };
}

export function selectFlashcardPage(cards: readonly StoredFlashcard[], query: string, page: number) {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = cards
    .map((card, index) => ({ card, position: index + 1 }))
    .filter(({ card }) => matchesQuery(`${card.id}\n${card.front}\n${card.back}`, normalized));
  return paginate(matches, page);
}
