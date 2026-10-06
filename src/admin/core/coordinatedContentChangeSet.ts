import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema';
import { previewChangeSet } from './applyChangeSet';
import { parseChangeSet } from './changeSetSchema';
import {
  isFlashcardAdminChangeSet,
  replayFlashcardAdminChangeSet,
  type FlashcardAdminChangeSet,
} from './flashcardChangeSet';
import { revisionForBank } from './serializeBank';
import type { AdminChangeSet } from './types';

export interface CoordinatedContentChangeSet {
  bundleVersion: 1;
  quizzes: AdminChangeSet;
  flashcards: FlashcardAdminChangeSet;
}

/** Validate the final pair without requiring an invalid intermediate subject catalog. */
export async function replayCoordinatedContentChangeSet(
  quizBank: StoredQuestionBank,
  flashcardBank: StoredFlashcardBank,
  input: unknown,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid coordinated content bundle.');
  const bundle = input as Record<string, unknown>;
  if (
    bundle.bundleVersion !== 1 ||
    Object.keys(bundle).some((key) => !['bundleVersion', 'quizzes', 'flashcards'].includes(key))
  )
    throw new Error('Invalid coordinated content bundle.');
  const parsed = parseChangeSet(bundle.quizzes);
  if (!parsed.changeSet || !isFlashcardAdminChangeSet(bundle.flashcards))
    throw new Error('The bundle must contain valid quiz and flashcard change sets.');
  if (parsed.changeSet.base.revision !== (await revisionForBank(quizBank)))
    throw new Error('The coordinated quiz change set is based on stale content.');
  const candidate = previewChangeSet(quizBank, parsed.changeSet, {
    schemaVersion: 2,
    decks: [],
    cards: [],
  });
  const errors = candidate.issues.filter((issue) => issue.level === 'error');
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '));
  const flashcards = await replayFlashcardAdminChangeSet(
    flashcardBank,
    quizBank.subjects,
    bundle.flashcards,
    candidate.bank.subjects,
  );
  return {
    quizzes: candidate.bank,
    flashcards,
    quizChangeSet: parsed.changeSet,
    flashcardChangeSet: bundle.flashcards,
  };
}
