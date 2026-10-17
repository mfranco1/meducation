import type { StoredQuestionBank } from '../../content/schema/schema';
import type { BulkPlan } from '../data/DraftStore';

export type BulkAddContext =
  | { kind: 'newTopic'; subjectId: string }
  | { kind: 'topic'; topicId: string }
  | { kind: 'quiz'; topicId: string; quizId: string };

export interface BulkAddItemDraft {
  stem: string;
  choices: string[];
  answer: string;
  rationale: string;
  verifiedAnswer?: string;
  answerNote?: string;
  rationaleMeta?: {
    sources?: string;
    answerReviewNote?: string;
    provenance?: 'source_migrated' | 'ai_draft_reviewed';
    reviewedAt?: string;
    reviewNote?: string;
  };
  choiceExplanations?: Record<string, string>;
  pearls?: string[];
  metadata?: {
    topic?: string;
    subtopic?: string;
    system?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    questionType?: string;
    tags?: string[];
  };
}

export interface BulkAddQuizDraft {
  name: string;
  items: BulkAddItemDraft[];
}

export type BulkAddDraft =
  | { topic: { name: string }; quizzes: BulkAddQuizDraft[] }
  | { quizzes: BulkAddQuizDraft[] }
  | { items: BulkAddItemDraft[] };

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const nonEmptyString = (value: unknown) => isString(value) && Boolean(value.trim());
const choiceLabel = (index: number) => String.fromCharCode(65 + index);

const itemKeys = ['stem', 'choices', 'answer', 'rationale', 'verifiedAnswer', 'answerNote', 'rationaleMeta', 'choiceExplanations', 'pearls', 'metadata'];
const metaKeys = ['sources', 'answerReviewNote', 'provenance', 'reviewedAt', 'reviewNote'];
const metadataKeys = ['topic', 'subtopic', 'system', 'difficulty', 'questionType', 'tags'];

function parseItem(value: unknown, path: string): { item?: BulkAddItemDraft; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(value)) return { errors: [`${path} must be an object.`] };
  for (const key of Object.keys(value)) if (!itemKeys.includes(key)) errors.push(`${path}.${key} is not an editable item field.`);
  for (const field of ['stem', 'rationale'] as const) if (!nonEmptyString(value[field])) errors.push(`${path}.${field} must be a non-empty string.`);
  if (!Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 26 || !value.choices.every(nonEmptyString)) {
    errors.push(`${path}.choices must contain 2 to 26 non-empty choice strings.`);
  }
  const labels = Array.isArray(value.choices) ? value.choices.map((_, index) => choiceLabel(index)) : [];
  if (!isString(value.answer) || !labels.includes(value.answer)) errors.push(`${path}.answer must be one of the generated choice labels: ${labels.join(', ')}.`);
  if (value.verifiedAnswer !== undefined && (!isString(value.verifiedAnswer) || !labels.includes(value.verifiedAnswer))) errors.push(`${path}.verifiedAnswer must reference a generated choice label.`);
  if (value.answerNote !== undefined && !isString(value.answerNote)) errors.push(`${path}.answerNote must be a string.`);

  if (value.rationaleMeta !== undefined) {
    if (!isObject(value.rationaleMeta)) errors.push(`${path}.rationaleMeta must be an object.`);
    else {
      for (const key of Object.keys(value.rationaleMeta)) if (!metaKeys.includes(key)) errors.push(`${path}.rationaleMeta.${key} is not an editable rationale field.`);
      for (const key of ['sources', 'answerReviewNote', 'reviewedAt', 'reviewNote'] as const) {
        if (value.rationaleMeta[key] !== undefined && !isString(value.rationaleMeta[key])) errors.push(`${path}.rationaleMeta.${key} must be a string.`);
      }
      if (value.rationaleMeta.provenance !== undefined && value.rationaleMeta.provenance !== 'source_migrated' && value.rationaleMeta.provenance !== 'ai_draft_reviewed') errors.push(`${path}.rationaleMeta.provenance is unsupported.`);
    }
  }

  if (value.choiceExplanations !== undefined) {
    if (!isObject(value.choiceExplanations)) errors.push(`${path}.choiceExplanations must be an object keyed by generated choice labels.`);
    else for (const [key, explanation] of Object.entries(value.choiceExplanations)) {
      if (!labels.includes(key)) errors.push(`${path}.choiceExplanations.${key} does not match a generated choice label.`);
      if (!isString(explanation)) errors.push(`${path}.choiceExplanations.${key} must be a string.`);
    }
  }
  if (value.pearls !== undefined && (!Array.isArray(value.pearls) || !value.pearls.every(isString))) errors.push(`${path}.pearls must be an array of strings.`);

  if (value.metadata !== undefined) {
    if (!isObject(value.metadata)) errors.push(`${path}.metadata must be an object.`);
    else {
      for (const key of Object.keys(value.metadata)) if (!metadataKeys.includes(key)) errors.push(`${path}.metadata.${key} is not an editable metadata field.`);
      for (const key of ['topic', 'subtopic', 'system', 'questionType'] as const) if (value.metadata[key] !== undefined && !isString(value.metadata[key])) errors.push(`${path}.metadata.${key} must be a string.`);
      if (value.metadata.difficulty !== undefined && !['easy', 'medium', 'hard'].includes(String(value.metadata.difficulty))) errors.push(`${path}.metadata.difficulty must be easy, medium, or hard.`);
      if (value.metadata.tags !== undefined && (!Array.isArray(value.metadata.tags) || !value.metadata.tags.every(isString))) errors.push(`${path}.metadata.tags must be an array of strings.`);
      if (!Object.values(value.metadata).some(entry => Array.isArray(entry) ? entry.length > 0 : Boolean(entry))) errors.push(`${path}.metadata must not be empty.`);
    }
  }

  return errors.length ? { errors } : { item: value as unknown as BulkAddItemDraft, errors };
}

function parseQuizzes(value: unknown, path: string): { quizzes?: BulkAddQuizDraft[]; errors: string[] } {
  if (!Array.isArray(value) || !value.length) return { errors: [`${path} must be a non-empty array.`] };
  const errors: string[] = [];
  const quizzes: BulkAddQuizDraft[] = [];
  value.forEach((candidate, index) => {
    const quizPath = `${path}[${index}]`;
    if (!isObject(candidate)) { errors.push(`${quizPath} must be an object.`); return; }
    for (const key of Object.keys(candidate)) if (!['name', 'items'].includes(key)) errors.push(`${quizPath}.${key} is not an editable quiz field.`);
    if (!nonEmptyString(candidate.name)) errors.push(`${quizPath}.name must be a non-empty string.`);
    if (!Array.isArray(candidate.items) || !candidate.items.length) { errors.push(`${quizPath}.items must be a non-empty array.`); return; }
    const items = candidate.items.map((item, itemIndex) => parseItem(item, `${quizPath}.items[${itemIndex}]`));
    errors.push(...items.flatMap(result => result.errors));
    if (items.every(result => result.item)) quizzes.push({ name: candidate.name as string, items: items.map(result => result.item!) });
  });
  return errors.length ? { errors } : { quizzes, errors };
}

export function parseBulkAddDraft(value: unknown, context: BulkAddContext): { draft?: BulkAddDraft; errors: string[] } {
  if (!isObject(value)) return { errors: ['Draft must be a JSON object.'] };
  const errors: string[] = [];
  if (context.kind === 'quiz') {
    for (const key of Object.keys(value)) if (key !== 'items') errors.push(`$.${key} is managed by the admin panel or is not editable in this template.`);
    if (!Array.isArray(value.items) || !value.items.length) errors.push('$.items must be a non-empty array.');
    const parsedItems = Array.isArray(value.items) ? value.items.map((item, index) => parseItem(item, `$.items[${index}]`)) : [];
    errors.push(...parsedItems.flatMap(result => result.errors));
    return errors.length ? { errors } : { draft: { items: parsedItems.map(result => result.item!) }, errors };
  }

  if (context.kind === 'newTopic') {
    for (const key of Object.keys(value)) if (!['topic', 'quizzes'].includes(key)) errors.push(`$.${key} is managed by the admin panel or is not editable in this template.`);
    if (!isObject(value.topic)) errors.push('$.topic must contain editable topic content.');
    else {
      for (const key of Object.keys(value.topic)) if (key !== 'name') errors.push(`$.topic.${key} is managed by the admin panel or is not editable.`);
      if (!nonEmptyString(value.topic.name)) errors.push('$.topic.name must be a non-empty string.');
    }
    const parsed = parseQuizzes(value.quizzes, '$.quizzes');
    errors.push(...parsed.errors);
    return errors.length ? { errors } : { draft: { topic: { name: (value.topic as JsonObject).name as string }, quizzes: parsed.quizzes! }, errors };
  }

  for (const key of Object.keys(value)) if (key !== 'quizzes') errors.push(`$.${key} is managed by the admin panel or is not editable in this template.`);
  const parsed = parseQuizzes(value.quizzes, '$.quizzes');
  errors.push(...parsed.errors);
  return errors.length ? { errors } : { draft: { quizzes: parsed.quizzes! }, errors };
}

const itemFields = (item: BulkAddItemDraft) => ({
  ...item,
  choices: item.choices.map((text, index) => ({ id: choiceLabel(index), text })),
});

/** Parses the editable JSON into the records to create. Parent IDs come from the chosen destination. */
export function compileBulkAddDraft(
  value: unknown,
  context: BulkAddContext,
  bank: StoredQuestionBank,
): { plan?: BulkPlan; errors: string[] } {
  const parsed = parseBulkAddDraft(value, context);
  if (!parsed.draft) return { errors: parsed.errors };
  const draft = parsed.draft;
  if (context.kind === 'quiz') {
    if (!('items' in draft)) return { errors: ['Selected quiz draft must contain an items array.'] };
    const selectedQuiz = bank.quizzes.find((quiz) => quiz.id === context.quizId);
    if (!selectedQuiz || selectedQuiz.topicId !== context.topicId)
      return { errors: ['Selected quiz is not part of the selected topic.'] };
    return {
      plan: { groups: [{ parentId: selectedQuiz.id, childKind: 'questions', children: draft.items.map(itemFields) }] },
      errors: [],
    };
  }
  if ('items' in draft) return { errors: ['Topic draft must contain a quizzes array.'] };
  if (context.kind === 'newTopic' && !('topic' in draft))
    return { errors: ['New topic draft is missing topic content.'] };
  return {
    plan: {
      ...(context.kind === 'topic'
        ? { topicId: context.topicId }
        : { subjectId: context.subjectId, topic: { name: (draft as { topic: { name: string } }).topic.name } }),
      groups: draft.quizzes.map((quiz) => ({
        create: { kind: 'quizzes' as const, fields: { name: quiz.name } },
        childKind: 'questions' as const,
        children: quiz.items.map(itemFields),
      })),
    },
    errors: [],
  };
}

/** Editable JSON contains content only; parent IDs and protocol fields live in panel state. */
export function bulkAddTemplate(context: BulkAddContext): BulkAddDraft {
  const item = { stem: '', choices: ['', ''], answer: 'A', rationale: '' };
  if (context.kind === 'newTopic') return {
    topic: { name: '' },
    quizzes: [{ name: '', items: [{ ...item }] }],
  };
  if (context.kind === 'topic') return { quizzes: [{ name: '', items: [{ ...item }] }] };
  return { items: [{ ...item }] };
}
