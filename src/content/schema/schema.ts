import type { Choice, FlashcardCard, QuestionMetadata, RationaleMetadata } from '../../domain/types';

export interface StoredSubject {
  id: string;
  name: string;
  accent: string;
  description?: string;
}

export interface StoredTopic {
  id: string;
  subjectId: string;
  name: string;
  description?: string;
}

export interface StoredQuiz {
  id: string;
  topicId: string;
  name: string;
  description?: string;
}

export interface StoredQuestion {
  id: string;
  quizId: string;
  stem: string;
  choices: Choice[];
  answer: string;
  rationale: string;
  rationaleMeta?: RationaleMetadata;
  pearls?: string[];
  metadata?: QuestionMetadata;
}

export interface StoredQuestionBank {
  schemaVersion: 6;
  subjects: StoredSubject[];
  topics: StoredTopic[];
  quizzes: StoredQuiz[];
  questions: StoredQuestion[];
}

export interface StoredFlashcardDeck {
  id: string;
  topicId: string;
  name: string;
  description?: string;
}

export type StoredFlashcard = FlashcardCard;

export interface StoredFlashcardBank {
  schemaVersion: 4;
  decks: StoredFlashcardDeck[];
  cards: StoredFlashcard[];
}
