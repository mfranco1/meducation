import type { Subject } from '../../../domain/types';
import type { FlashcardDeckSummary } from '../../../content/api/flashcardApiDecoders';

export type FlashcardsView =
  | { page: 'flashcards' }
  | { page: 'flashcards-subject'; subject: Subject; continueStudying?: boolean }
  | { page: 'flashcards-study'; subject: Subject; deck: FlashcardDeckSummary; index: number; revealed: boolean };
