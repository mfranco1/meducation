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

export type GroupedSubjectRef = { create: StoredSubject } | { existingId: string };
export type GroupedQuizRef = { create: Omit<StoredQuiz, 'subjectId'> } | { existingId: string };
export type GroupedQuestionInput = Omit<StoredQuestion, 'quizId'>;
export interface GroupedQuizAdd {
  quiz: GroupedQuizRef;
  items: GroupedQuestionInput[];
}
export interface ContentAddOperation {
  op: 'content.add';
  subject: GroupedSubjectRef;
  quizzes: GroupedQuizAdd[];
}
export type AdminChangeOperation = AdminOperation | ContentAddOperation;

export interface AdminChangeSet {
  changeSetVersion: 1 | 2;
  base: { bankSchemaVersion: 4; revision: string };
  reason: string;
  operations: AdminChangeOperation[];
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
