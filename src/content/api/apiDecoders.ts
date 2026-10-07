import type { Question, Quiz, Subject } from '../../domain/types';
import { nonempty, onlyKeys, record, unique } from './jsonGuards';

export interface SubjectSummary extends Subject { quizCount: number; quizIds: string[] }
export interface SubjectCatalogResponse { revision: string; subjects: SubjectSummary[] }
export interface QuizCatalogResponse { revision: string; quizzes: Quiz[] }
export interface QuestionListResponse { revision: string; questions: Question[] }

const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const sameOrder = (actual: string[], expected: string[]) => actual.length === expected.length && actual.every((id, index) => id === expected[index]);
const ids = (value: unknown, pattern: RegExp): value is string[] => Array.isArray(value)
  && value.every((id: unknown) => typeof id === 'string' && pattern.test(id)) && unique(value);

function validRationaleMeta(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value) || !onlyKeys(value, ['sources', 'answerReviewNote', 'provenance', 'reviewedAt', 'reviewNote'])) return false;
  if (!optionalString(value.sources) || !optionalString(value.answerReviewNote) || !optionalString(value.reviewedAt) || !optionalString(value.reviewNote)) return false;
  if (value.provenance !== undefined && value.provenance !== 'source_migrated' && value.provenance !== 'ai_draft_reviewed') return false;
  return value.provenance !== 'ai_draft_reviewed' || (nonempty(value.reviewedAt) && nonempty(value.reviewNote));
}

function validMetadata(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value) || !onlyKeys(value, ['topic', 'subtopic', 'system', 'difficulty', 'questionType', 'tags'])) return false;
  if (!['topic', 'subtopic', 'system', 'questionType'].every(key => optionalString(value[key]))) return false;
  if (value.difficulty !== undefined && !['easy', 'medium', 'hard'].includes(value.difficulty as string)) return false;
  if (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every((tag: unknown) => typeof tag === 'string'))) return false;
  return Object.values(value).some(item => Array.isArray(item) ? item.length > 0 : Boolean(item));
}

export function isSubjectCatalog(value: unknown): value is SubjectCatalogResponse {
  if (!record(value) || !nonempty(value.revision) || !Array.isArray(value.subjects)) return false;
  const allQuizIds: string[] = [];
  const subjects = value.subjects;
  if (!subjects.every((entry: unknown) => {
    if (!record(entry) || !onlyKeys(entry, ['id', 'name', 'accent', 'quizCount', 'quizIds'])) return false;
    if (!nonempty(entry.id) || !/^s[1-9]\d*$/.test(entry.id) || !nonempty(entry.name) || typeof entry.accent !== 'string') return false;
    if (!ids(entry.quizIds, /^q[1-9]\d*$/) || !Number.isInteger(entry.quizCount) || entry.quizCount !== entry.quizIds.length) return false;
    allQuizIds.push(...entry.quizIds);
    return true;
  })) return false;
  return unique(subjects.map((subject: SubjectSummary) => subject.id)) && unique(allQuizIds);
}

export function isQuizCatalog(value: unknown, subjectId: string, expectedQuizIds: string[]): value is QuizCatalogResponse {
  if (!record(value) || !nonempty(value.revision) || !Array.isArray(value.quizzes)) return false;
  const allQuestionIds: string[] = [];
  if (!value.quizzes.every((entry: unknown) => {
    if (!record(entry) || !onlyKeys(entry, ['id', 'subjectId', 'name', 'questionCount', 'questionIds'])) return false;
    if (!nonempty(entry.id) || !/^q[1-9]\d*$/.test(entry.id) || entry.subjectId !== subjectId || !nonempty(entry.name)) return false;
    if (!ids(entry.questionIds, /^i[1-9]\d*$/) || !Number.isInteger(entry.questionCount) || entry.questionCount !== entry.questionIds.length || entry.questionCount === 0) return false;
    allQuestionIds.push(...entry.questionIds);
    return true;
  })) return false;
  return sameOrder(value.quizzes.map((quiz: Quiz) => quiz.id), expectedQuizIds) && unique(allQuestionIds);
}

function validQuestion(value: unknown, quizId: string): value is Question {
  if (!record(value) || !onlyKeys(value, ['id', 'quizId', 'stem', 'choices', 'answer', 'verifiedAnswer', 'answerNote', 'rationale', 'rationaleMeta', 'choiceExplanations', 'pearls', 'metadata'])) return false;
  if (!nonempty(value.id) || !/^i[1-9]\d*$/.test(value.id) || value.quizId !== quizId || !nonempty(value.stem) || !nonempty(value.rationale)) return false;
  if (!Array.isArray(value.choices) || value.choices.length < 2 || !value.choices.every((choice: unknown) => record(choice) && onlyKeys(choice, ['id', 'text']) && typeof choice.id === 'string' && /^[A-Z]$/.test(choice.id) && nonempty(choice.text))) return false;
  const choiceIds = value.choices.map((choice: { id: string }) => choice.id);
  if (!unique(choiceIds) || !optionalString(value.answer) || !optionalString(value.verifiedAnswer) || !optionalString(value.answerNote)) return false;
  const resolved = value.verifiedAnswer ?? value.answer;
  if (typeof resolved !== 'string' || !choiceIds.includes(resolved)) return false;
  if (value.answer !== undefined && !choiceIds.includes(value.answer)) return false;
  if (value.verifiedAnswer !== undefined && !choiceIds.includes(value.verifiedAnswer)) return false;
  if (!validRationaleMeta(value.rationaleMeta) || !validMetadata(value.metadata)) return false;
  if (value.choiceExplanations !== undefined && (!record(value.choiceExplanations) || Object.entries(value.choiceExplanations).some(([id, explanation]) => !choiceIds.includes(id) || typeof explanation !== 'string'))) return false;
  return value.pearls === undefined || (Array.isArray(value.pearls) && value.pearls.every((pearl: unknown) => typeof pearl === 'string'));
}

export function isQuestionList(value: unknown, quizId: string, expectedQuestionIds: string[]): value is QuestionListResponse {
  if (!record(value) || !nonempty(value.revision) || !Array.isArray(value.questions)) return false;
  if (!value.questions.every((question: unknown) => validQuestion(question, quizId))) return false;
  return sameOrder(value.questions.map((question: Question) => question.id), expectedQuestionIds);
}

export function responseRevision(value: unknown): string | undefined {
  return record(value) && typeof value.revision === 'string' ? value.revision : undefined;
}
