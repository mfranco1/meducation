import { vi } from 'vitest';
import type { Question, Quiz, Subject } from '../domain/types';
import type { StoredFlashcard } from '../content/schema/schema';
import type { FlashcardDeckSummary, FlashcardSubjectSummary } from '../content/api/flashcardApiDecoders';
import type { JsonTransport } from '../content/api/contentTransport';
import { runtimeQuestionBank } from '../content/api/runtimeQuestionBank';
import * as flashcards from '../content/api/runtimeFlashcardBank';

/** Exercise the API path with synthetic DTOs instead of enabling a local content source. */
export function installQuizApiFixture(subjects: Subject[], quizzes: Quiz[], questions: Question[]) {
  const revision = 'quiz-fixture';
  runtimeQuestionBank.configureApi(
    { revision, subjects },
    subjects.map((subject) => ({
      revision,
      quizzes: quizzes.filter((quiz) => quiz.subjectId === subject.id),
    })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      const url = new URL(path, 'http://fixture.test');
      let payload: unknown;
      if (url.pathname === '/api/v1/subjects') {
        payload = {
          revision,
          subjects: subjects.map((subject) => ({
            ...subject,
            quizCount: quizzes.filter((quiz) => quiz.subjectId === subject.id).length,
            quizIds: quizzes.filter((quiz) => quiz.subjectId === subject.id).map((quiz) => quiz.id),
          })),
        };
      } else {
        const match = /^\/api\/v1\/quizzes\/([^/]+)\/questions$/.exec(url.pathname);
        if (!match) throw new Error(`Unexpected fixture request: ${url.pathname}`);
        payload = {
          revision,
          questions: questions.filter((question) => question.quizId === decodeURIComponent(match[1])),
        };
      }
      return { ok: true, json: async () => structuredClone(payload) };
    }),
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
