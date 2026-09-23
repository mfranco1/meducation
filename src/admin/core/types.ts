import type { StoredQuestion, StoredQuestionBank, StoredQuiz, StoredSubject } from '../../content/schema';
import type { ValidationIssue } from '../../content/validate';

export type AdminOperation =
  | { op: 'subject.create'; value: StoredSubject; afterId?: string }
  | { op: 'subject.update'; id: string; value: StoredSubject; afterId?: string }
  | { op: 'subject.delete'; id: string; cascade?: boolean }
  | { op: 'quiz.create'; value: StoredQuiz; afterId?: string }
  | { op: 'quiz.update'; id: string; value: StoredQuiz; afterId?: string }
  | { op: 'quiz.delete'; id: string; cascade?: boolean }
  | { op: 'question.create'; value: StoredQuestion; afterId?: string }
  | { op: 'question.update'; id: string; value: StoredQuestion; afterId?: string }
  | { op: 'question.delete'; id: string };

export interface AdminChangeSet {
  changeSetVersion: 1;
  base: { bankSchemaVersion: 4; revision: string };
  reason: string;
  operations: AdminOperation[];
}

export interface AdminBankSnapshot {
  bank: StoredQuestionBank;
  revision: string;
}

export interface AdminChangePreview {
  bank: StoredQuestionBank;
  issues: ValidationIssue[];
  summary: { creates: number; updates: number; deletes: number; moves: number; cascadedQuestions: number; cascadedQuizzes: number };
}

export interface AppliedAdminChange extends AdminChangeSet {
  appliedAtRevision: string;
}
