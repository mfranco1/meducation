import type { Choice, QuestionMetadata, RationaleMetadata } from '../domain/types';

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
