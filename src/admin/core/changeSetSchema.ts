import type { StoredQuestion, StoredQuiz, StoredSubject } from '../../content/schema';
import type { AdminChangeSet, AdminOperation } from './types';

type RecordValue = Record<string, unknown>;
const has = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const optionalString = (value: unknown): value is string | undefined => value === undefined || string(value);
const allowed = (value: RecordValue, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

function subject(value: unknown): value is StoredSubject {
  return has(value) && allowed(value, ['id', 'name', 'accent']) && string(value.id) && string(value.name) && string(value.accent);
}
function quiz(value: unknown): value is StoredQuiz {
  return has(value) && allowed(value, ['id', 'subjectId', 'name']) && string(value.id) && string(value.subjectId) && string(value.name);
}
function rationaleMeta(value: unknown): boolean {
  return value === undefined || (has(value) && allowed(value, ['sources', 'answerReviewNote', 'provenance', 'reviewedAt', 'reviewNote'])
    && optionalString(value.sources) && optionalString(value.answerReviewNote) && optionalString(value.provenance) && optionalString(value.reviewedAt) && optionalString(value.reviewNote));
}
function metadata(value: unknown): boolean {
  return value === undefined || (has(value) && allowed(value, ['topic', 'subtopic', 'system', 'difficulty', 'questionType', 'tags'])
    && optionalString(value.topic) && optionalString(value.subtopic) && optionalString(value.system) && optionalString(value.difficulty)
    && optionalString(value.questionType) && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every(string))));
}
function question(value: unknown): value is StoredQuestion {
  if (!has(value) || !allowed(value, ['id', 'quizId', 'stem', 'choices', 'answer', 'verifiedAnswer', 'answerNote', 'rationale', 'rationaleMeta', 'choiceExplanations', 'pearls', 'metadata'])) return false;
  if (!string(value.id) || !string(value.quizId) || !string(value.stem) || !string(value.rationale) || !optionalString(value.answer) || !optionalString(value.verifiedAnswer) || !optionalString(value.answerNote)) return false;
  if (!Array.isArray(value.choices) || !value.choices.every(choice => has(choice) && allowed(choice, ['id', 'text']) && string(choice.id) && string(choice.text))) return false;
  if (!rationaleMeta(value.rationaleMeta) || !metadata(value.metadata)) return false;
  if (value.choiceExplanations !== undefined && (!has(value.choiceExplanations) || !Object.values(value.choiceExplanations).every(string))) return false;
  return value.pearls === undefined || (Array.isArray(value.pearls) && value.pearls.every(string));
}

function operation(value: unknown): value is AdminOperation {
  if (!has(value) || !string(value.op) || !allowed(value, ['op', 'id', 'value', 'afterId', 'cascade']) || !optionalString(value.id) || !optionalString(value.afterId) || (value.cascade !== undefined && typeof value.cascade !== 'boolean')) return false;
  switch (value.op) {
    case 'subject.create': return subject(value.value) && value.id === undefined && value.cascade === undefined;
    case 'subject.update': return string(value.id) && subject(value.value) && value.cascade === undefined;
    case 'subject.delete': return string(value.id) && value.value === undefined && value.afterId === undefined;
    case 'quiz.create': return quiz(value.value) && value.id === undefined && value.cascade === undefined;
    case 'quiz.update': return string(value.id) && quiz(value.value) && value.cascade === undefined;
    case 'quiz.delete': return string(value.id) && value.value === undefined && value.afterId === undefined;
    case 'question.create': return question(value.value) && value.id === undefined && value.cascade === undefined;
    case 'question.update': return string(value.id) && question(value.value) && value.cascade === undefined;
    case 'question.delete': return string(value.id) && value.value === undefined && value.afterId === undefined && value.cascade === undefined;
    default: return false;
  }
}

function groupedReference(value: unknown, kind: 'subject' | 'quiz', path: string): string[] {
  if (!has(value) || !allowed(value, ['create', 'existingId']) || (('create' in value) === ('existingId' in value))) {
    return [`${path} must contain exactly one of create or existingId.`];
  }
  if ('existingId' in value) return string(value.existingId) && value.existingId.trim() ? [] : [`${path}.existingId must be a non-empty string.`];
  if (kind === 'subject') return subject(value.create) ? [] : [`${path}.create has an invalid subject shape.`];
  return has(value.create) && allowed(value.create, ['id', 'name']) && string(value.create.id) && string(value.create.name)
    ? [] : [`${path}.create must contain only a quiz id and name.`];
}

function groupedItem(value: unknown): boolean {
  if (!has(value) || 'quizId' in value) return false;
  // Validate all item fields through the stored-question contract after supplying a sentinel parent.
  return question({ ...value, quizId: 'q1' });
}

function contentAddErrors(value: unknown, path: string): string[] {
  if (!has(value) || !allowed(value, ['op', 'subject', 'quizzes']) || value.op !== 'content.add') return [`${path} is not a valid content.add operation.`];
  const errors = groupedReference(value.subject, 'subject', `${path}.subject`);
  if (!Array.isArray(value.quizzes) || value.quizzes.length === 0) errors.push(`${path}.quizzes must be a non-empty array.`);
  else value.quizzes.forEach((candidate, quizIndex) => {
    const quizPath = `${path}.quizzes[${quizIndex}]`;
    if (!has(candidate) || !allowed(candidate, ['quiz', 'items'])) { errors.push(`${quizPath} must contain only quiz and items.`); return; }
    errors.push(...groupedReference(candidate.quiz, 'quiz', `${quizPath}.quiz`));
    if (!Array.isArray(candidate.items) || candidate.items.length === 0) errors.push(`${quizPath}.items must be a non-empty array.`);
    else candidate.items.forEach((item, itemIndex) => {
      if (!groupedItem(item)) errors.push(`${quizPath}.items[${itemIndex}] has an invalid item shape; omit quizId because it is inherited from the quiz block.`);
    });
  });
  return errors;
}

export function parseChangeSet(value: unknown): { changeSet?: AdminChangeSet; errors: string[] } {
  if (!has(value) || !allowed(value, ['changeSetVersion', 'base', 'reason', 'operations'])) return { errors: ['Change set must be an object with only changeSetVersion, base, reason, and operations.'] };
  if (value.changeSetVersion !== 1 && value.changeSetVersion !== 2) return { errors: ['Unsupported change-set version.'] };
  if (!has(value.base) || !allowed(value.base, ['bankSchemaVersion', 'revision']) || value.base.bankSchemaVersion !== 4 || !string(value.base.revision)) return { errors: ['Change set base must contain bankSchemaVersion: 4 and a revision.'] };
  if (!string(value.reason) || !value.reason.trim()) return { errors: ['Change set reason is required.'] };
  if (!Array.isArray(value.operations) || !value.operations.length) return { errors: ['Change set requires at least one operation.'] };
  const errors = value.operations.flatMap((candidate, index) => {
    const path = `operations[${index}]`;
    if (has(candidate) && candidate.op === 'content.add') {
      return value.changeSetVersion === 2 ? contentAddErrors(candidate, path) : [`${path}: content.add requires changeSetVersion 2.`];
    }
    return operation(candidate) ? [] : [`${path} has an invalid shape or unsupported field.`];
  });
  return errors.length ? { errors } : { changeSet: value as unknown as AdminChangeSet, errors: [] };
}
