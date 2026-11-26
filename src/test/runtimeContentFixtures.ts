import { vi } from 'vitest';
import type { Question, Quiz, Subject, Topic } from '../domain/types';
import type { StoredFlashcard } from '../content/schema/schema';
import type { FlashcardDeckSummary, FlashcardSubjectSummary } from '../content/api/flashcardApiDecoders';
import type { JsonTransport } from '../content/api/contentTransport';
import * as runtime from '../content/api/runtimeQuestionBank';
import * as flashcards from '../content/api/runtimeFlashcardBank';

/** One topic per distinct `topicId`, named after its ID unless named in `names`. */
function topicsFor(
  rows: readonly { subjectId: string; topicId: string }[],
  names: Record<string, string> = {},
): Topic[] {
  const ids = [...new Map(rows.map((row) => [row.topicId, row.subjectId])).entries()];
  return ids.map(([id, subjectId]) => ({ id, subjectId, name: names[id] ?? `Topic ${id}` }));
}

/** Make `bank` the app's question bank and load its subjects and quiz catalogs, as the app does. */
export async function installRuntimeBank(bank: runtime.RuntimeQuestionBank) {
  vi.spyOn(runtime, 'runtimeQuestionBank', 'get').mockReturnValue(bank);
  vi.spyOn(runtime, 'loadRuntimeContent').mockImplementation(async () => {
    await bank.ensureSubjects();
  });
  for (const subject of await bank.ensureSubjects()) await bank.ensureQuizzes(subject.id);
  return bank;
}

/** Exercise the API path with synthetic DTOs instead of enabling a local content source. */
export async function installQuizApiFixture(
  subjects: Subject[],
  quizzes: Quiz[],
  questions: Question[],
  topics = topicsFor(quizzes),
) {
  const revision = 'quiz-fixture';
  const quizzesOf = (subjectId: string) => quizzes.filter((quiz) => quiz.subjectId === subjectId);
  const transport: JsonTransport = {
    get: async <T>(path: string) => {
      const url = new URL(path, 'http://fixture.test');
      if (url.pathname === '/api/v1/subjects')
        return structuredClone({
          revision,
          subjects: subjects.map((subject) => ({
            ...subject,
            quizCount: quizzesOf(subject.id).length,
            questionCount: quizzesOf(subject.id).reduce((sum, quiz) => sum + quiz.questionCount, 0),
            quizIds: quizzesOf(subject.id).map((quiz) => quiz.id),
          })),
        }) as T;
      const catalog = /^\/api\/v1\/subjects\/([^/]+)\/quizzes$/.exec(url.pathname);
      if (catalog) {
        const subjectId = decodeURIComponent(catalog[1]);
        return structuredClone({
          revision,
          topics: topics.filter((topic) => topic.subjectId === subjectId),
          quizzes: quizzesOf(subjectId),
        }) as T;
      }
      const body = /^\/api\/v1\/quizzes\/([^/]+)\/questions$/.exec(url.pathname);
      if (!body) throw new Error(`Unexpected fixture request: ${url.pathname}`);
      return structuredClone({
        revision,
        questions: questions.filter((question) => question.quizId === decodeURIComponent(body[1])),
      }) as T;
    },
  };
  return installRuntimeBank(
    new runtime.RuntimeQuestionBank({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 }, () => 0, transport),
  );
}

export async function installFlashcardApiFixture(
  subjects: FlashcardSubjectSummary[],
  decks: FlashcardDeckSummary[],
  cards: StoredFlashcard[],
) {
  const revision = 'flashcard-fixture';
  const transport: JsonTransport = {
    get: async <T>(path: string) => {
      const url = new URL(path, 'http://fixture.test');
      if (url.pathname === '/api/v1/flashcards/subjects') return structuredClone({ revision, subjects }) as T;
      const catalog = /^\/api\/v1\/flashcards\/subjects\/([^/]+)\/catalog$/.exec(url.pathname);
      if (catalog)
        return structuredClone({
          revision,
          topics: topicsFor(decks).filter((topic) => topic.subjectId === decodeURIComponent(catalog[1])),
          decks: decks.filter((deck) => deck.subjectId === decodeURIComponent(catalog[1])),
        }) as T;
      const body = /^\/api\/v1\/flashcards\/decks\/([^/]+)\/cards$/.exec(url.pathname);
      if (body)
        return structuredClone({
          revision,
          cards: cards.filter((card) => card.deckId === decodeURIComponent(body[1])),
        }) as T;
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    },
  };
  const bank = new flashcards.RuntimeFlashcardBank({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 }, transport);
  vi.spyOn(flashcards, 'runtimeFlashcardBank', 'get').mockReturnValue(bank);
  vi.spyOn(flashcards, 'loadRuntimeFlashcardSubjects').mockImplementation(async () => {
    await bank.ensureSubjects();
  });
  await bank.ensureSubjects();
  for (const subject of subjects) await bank.ensureSubjectCatalog(subject.id);
  for (const deck of decks) await bank.ensureCards(deck.id);
  return bank;
}
