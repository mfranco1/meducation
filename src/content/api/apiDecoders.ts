import type { Question, Quiz, Subject, Topic } from '../../domain/types';
import { isObject, nonBlank, onlyKeys, unique } from '../../domain/json';

export interface SubjectSummary extends Subject {
  quizCount: number;
  quizIds: string[];
}
export interface SubjectCatalogResponse {
  revision: string;
  subjects: SubjectSummary[];
}
export interface QuizCatalogResponse {
  revision: string;
  topics: Topic[];
  quizzes: Quiz[];
}
export interface QuestionListResponse {
  revision: string;
  questions: Question[];
}

export const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const sameOrder = (actual: string[], expected: string[]) =>
  actual.length === expected.length && actual.every((id, index) => id === expected[index]);
export const ids = (value: unknown, pattern: RegExp): value is string[] =>
  Array.isArray(value) && value.every((id: unknown) => typeof id === 'string' && pattern.test(id)) && unique(value);

function validRationaleMeta(value: unknown): boolean {
  if (value === undefined) return true;
  return isObject(value) && onlyKeys(value, ['sources']) && optionalString(value.sources);
}

function validMetadata(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObject(value) || !onlyKeys(value, ['topic', 'subtopic', 'system', 'difficulty', 'questionType', 'tags']))
    return false;
  if (!['topic', 'subtopic', 'system', 'questionType'].every((key) => optionalString(value[key]))) return false;
  if (value.difficulty !== undefined && !['easy', 'medium', 'hard'].includes(value.difficulty as string)) return false;
  if (
    value.tags !== undefined &&
    (!Array.isArray(value.tags) || !value.tags.every((tag: unknown) => typeof tag === 'string'))
  )
    return false;
  return Object.values(value).some((item) => (Array.isArray(item) ? item.length > 0 : Boolean(item)));
}

export function isSubjectCatalog(value: unknown): value is SubjectCatalogResponse {
  if (!isObject(value) || !nonBlank(value.revision) || !Array.isArray(value.subjects)) return false;
  const allQuizIds: string[] = [];
  const subjects = value.subjects;
  if (
    !subjects.every((entry: unknown) => {
      if (!isObject(entry) || !onlyKeys(entry, ['id', 'name', 'accent', 'description', 'quizCount', 'quizIds']))
        return false;
      if (
        !nonBlank(entry.id) ||
        !/^s[1-9]\d*$/.test(entry.id) ||
        !nonBlank(entry.name) ||
        typeof entry.accent !== 'string' ||
        !optionalString(entry.description)
      )
        return false;
      if (
        !ids(entry.quizIds, /^q[1-9]\d*$/) ||
        !Number.isInteger(entry.quizCount) ||
        entry.quizCount !== entry.quizIds.length
      )
        return false;
      allQuizIds.push(...entry.quizIds);
      return true;
    })
  )
    return false;
  return unique(subjects.map((subject: SubjectSummary) => subject.id)) && unique(allQuizIds);
}

/** A subject's topics, in order; quiz and deck catalogs must reference only these. */
export function isTopicList(value: unknown, subjectId: string): value is Topic[] {
  return (
    Array.isArray(value) &&
    value.every(
      (topic: unknown) =>
        isObject(topic) &&
        onlyKeys(topic, ['id', 'subjectId', 'name', 'description']) &&
        optionalString(topic.description) &&
        nonBlank(topic.id) &&
        /^t[1-9]\d*$/.test(topic.id) &&
        topic.subjectId === subjectId &&
        nonBlank(topic.name),
    ) &&
    unique(value.map((topic: Topic) => topic.id))
  );
}

export function isQuizCatalog(
  value: unknown,
  subjectId: string,
  expectedQuizIds: string[],
): value is QuizCatalogResponse {
  if (
    !isObject(value) ||
    !nonBlank(value.revision) ||
    !isTopicList(value.topics, subjectId) ||
    !Array.isArray(value.quizzes)
  )
    return false;
  const topicIds = value.topics.map((topic) => topic.id);
  const allQuestionIds: string[] = [];
  if (
    !value.quizzes.every((entry: unknown) => {
      if (
        !isObject(entry) ||
        !onlyKeys(entry, ['id', 'subjectId', 'topicId', 'name', 'description', 'questionCount', 'questionIds'])
      )
        return false;
      if (
        !optionalString(entry.description) ||
        !nonBlank(entry.id) ||
        !/^q[1-9]\d*$/.test(entry.id) ||
        entry.subjectId !== subjectId ||
        !topicIds.includes(entry.topicId as string) ||
        !nonBlank(entry.name)
      )
        return false;
      if (
        !ids(entry.questionIds, /^i[1-9]\d*$/) ||
        !Number.isInteger(entry.questionCount) ||
        entry.questionCount !== entry.questionIds.length ||
        entry.questionCount === 0
      )
        return false;
      allQuestionIds.push(...entry.questionIds);
      return true;
    })
  )
    return false;
  return (
    sameOrder(
      value.quizzes.map((quiz: Quiz) => quiz.id),
      expectedQuizIds,
    ) && unique(allQuestionIds)
  );
}

function validQuestion(value: unknown, quizId: string): value is Question {
  if (
    !isObject(value) ||
    !onlyKeys(value, ['id', 'quizId', 'stem', 'choices', 'answer', 'rationale', 'rationaleMeta', 'pearls', 'metadata'])
  )
    return false;
  if (
    !nonBlank(value.id) ||
    !/^i[1-9]\d*$/.test(value.id) ||
    value.quizId !== quizId ||
    !nonBlank(value.stem) ||
    !nonBlank(value.rationale)
  )
    return false;
  if (
    !Array.isArray(value.choices) ||
    value.choices.length < 2 ||
    !value.choices.every(
      (choice: unknown) =>
        isObject(choice) &&
        onlyKeys(choice, ['id', 'text']) &&
        typeof choice.id === 'string' &&
        /^[A-Z]$/.test(choice.id) &&
        nonBlank(choice.text),
    )
  )
    return false;
  const choiceIds = value.choices.map((choice: { id: string }) => choice.id);
  if (!unique(choiceIds) || typeof value.answer !== 'string' || !choiceIds.includes(value.answer)) return false;
  if (!validRationaleMeta(value.rationaleMeta) || !validMetadata(value.metadata)) return false;
  return (
    value.pearls === undefined ||
    (Array.isArray(value.pearls) && value.pearls.every((pearl: unknown) => typeof pearl === 'string'))
  );
}

export function isQuestionList(
  value: unknown,
  quizId: string,
  expectedQuestionIds: string[],
): value is QuestionListResponse {
  if (!isObject(value) || !nonBlank(value.revision) || !Array.isArray(value.questions)) return false;
  if (!value.questions.every((question: unknown) => validQuestion(question, quizId))) return false;
  return sameOrder(
    value.questions.map((question: Question) => question.id),
    expectedQuestionIds,
  );
}

export function responseRevision(value: unknown): string | undefined {
  return isObject(value) && typeof value.revision === 'string' ? value.revision : undefined;
}
