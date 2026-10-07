import type { Choice, FlashcardCard, QuestionMetadata, RationaleMetadata } from '../../domain/types';

export interface StoredSubject {
  id: string;
  name: string;
  accent: string;
}

export interface StoredQuiz {
  id: string;
  subjectId: string;
  name: string;
}

export interface StoredQuestion {
  id: string;
  quizId: string;
  stem: string;
  choices: Choice[];
  answer?: string;
  verifiedAnswer?: string;
  answerNote?: string;
  rationale: string;
  rationaleMeta?: RationaleMetadata;
  choiceExplanations?: Record<string, string>;
  pearls?: string[];
  metadata?: QuestionMetadata;
}

export interface StoredQuestionBank {
  schemaVersion: 4;
  subjects: StoredSubject[];
  quizzes: StoredQuiz[];
  questions: StoredQuestion[];
}

export interface StoredFlashcardDeck {
  id: string;
  subjectId: string;
  name: string;
  description?: string;
}

export type StoredFlashcard = FlashcardCard;

export interface StoredFlashcardBank {
  schemaVersion: 2;
  decks: StoredFlashcardDeck[];
  cards: StoredFlashcard[];
}
