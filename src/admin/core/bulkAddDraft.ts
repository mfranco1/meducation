import type { StoredQuestionBank } from '../../content/schema/schema';
import type { BulkPlan } from '../data/DraftStore';

export type BulkAddContext =
  | { kind: 'subject'; subjectId: string }
  | { kind: 'topic'; topicId: string }
  | { kind: 'quiz'; topicId: string; quizId: string };

export interface BulkAddItemDraft {
  stem: string;
  choices: string[];
  answer: string;
  rationale: string;
  rationaleMeta?: { sources?: string };
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
  description?: string;
  items: BulkAddItemDraft[];
}

export interface BulkAddTopicDraft {
  name: string;
  description?: string;
  quizzes: BulkAddQuizDraft[];
}

export type BulkAddDraft =
  | { topics: BulkAddTopicDraft[] }
  | { quizzes: BulkAddQuizDraft[] }
  | { items: BulkAddItemDraft[] };

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const nonEmptyString = (value: unknown) => isString(value) && Boolean(value.trim());
/** A blank description is left unset so an untouched template stores nothing. */
const optionalDescription = (value: unknown) => (isString(value) && value.trim() ? { description: value } : {});
const choiceLabel = (index: number) => String.fromCharCode(65 + index);

const itemKeys = ['stem', 'choices', 'answer', 'rationale', 'rationaleMeta', 'pearls', 'metadata'];
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

  if (value.rationaleMeta !== undefined) {
    if (!isObject(value.rationaleMeta)) errors.push(`${path}.rationaleMeta must be an object.`);
    else {
      for (const key of Object.keys(value.rationaleMeta)) if (key !== 'sources') errors.push(`${path}.rationaleMeta.${key} is not an editable rationale field.`);
      if (value.rationaleMeta.sources !== undefined && !isString(value.rationaleMeta.sources)) errors.push(`${path}.rationaleMeta.sources must be a string.`);
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
    for (const key of Object.keys(candidate)) if (!['name', 'description', 'items'].includes(key)) errors.push(`${quizPath}.${key} is not an editable quiz field.`);
    if (!nonEmptyString(candidate.name)) errors.push(`${quizPath}.name must be a non-empty string.`);
    if (candidate.description !== undefined && !isString(candidate.description)) errors.push(`${quizPath}.description must be a string.`);
    if (!Array.isArray(candidate.items) || !candidate.items.length) { errors.push(`${quizPath}.items must be a non-empty array.`); return; }
    const items = candidate.items.map((item, itemIndex) => parseItem(item, `${quizPath}.items[${itemIndex}]`));
    errors.push(...items.flatMap(result => result.errors));
    if (items.every(result => result.item)) quizzes.push({ name: candidate.name as string, ...optionalDescription(candidate.description), items: items.map(result => result.item!) });
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

  if (context.kind === 'subject') {
    for (const key of Object.keys(value)) if (key !== 'topics') errors.push(`$.${key} is managed by the admin panel or is not editable in this template.`);
    if (!Array.isArray(value.topics) || !value.topics.length) return { errors: [...errors, '$.topics must be a non-empty array.'] };
    const topics: BulkAddTopicDraft[] = [];
    value.topics.forEach((candidate, index) => {
      const path = `$.topics[${index}]`;
      if (!isObject(candidate)) { errors.push(`${path} must be an object.`); return; }
      for (const key of Object.keys(candidate)) if (!['name', 'description', 'quizzes'].includes(key)) errors.push(`${path}.${key} is managed by the admin panel or is not editable.`);
      if (!nonEmptyString(candidate.name)) errors.push(`${path}.name must be a non-empty string.`);
      if (candidate.description !== undefined && !isString(candidate.description)) errors.push(`${path}.description must be a string.`);
      const parsed = parseQuizzes(candidate.quizzes, `${path}.quizzes`);
      errors.push(...parsed.errors);
      if (parsed.quizzes) topics.push({ name: candidate.name as string, ...optionalDescription(candidate.description), quizzes: parsed.quizzes });
    });
    return errors.length ? { errors } : { draft: { topics }, errors };
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

export const nameKey = (name: string) => name.trim().toLowerCase();

/** Combines rows with the same name, keeping the first non-blank description. */
export function foldByName<T extends { name: string; description?: string }>(rows: T[], join: (into: T, row: T) => T): T[] {
  const folded = new Map<string, T>();
  for (const row of rows) {
    const previous = folded.get(nameKey(row.name));
    folded.set(nameKey(row.name), previous ? { ...join(previous, row), description: previous.description ?? row.description } : row);
  }
  return [...folded.values()].map(({ description, ...row }) => ({ ...row, ...(description === undefined ? {} : { description }) }) as T);
}

const foldQuizzes = (quizzes: BulkAddQuizDraft[]) => foldByName(quizzes, (into, quiz) => ({ ...into, items: [...into.items, ...quiz.items] }));

/** Quizzes matching an existing quiz by name add to it; the rest are created. */
const quizGroups = (quizzes: BulkAddQuizDraft[], existing: { id: string; name: string }[], merged: string[]) =>
  foldQuizzes(quizzes).map((quiz) => {
    const match = existing.find((row) => nameKey(row.name) === nameKey(quiz.name));
    const children = quiz.items.map(itemFields);
    if (match) {
      merged.push(`Quiz · ${match.name} · ${match.id}`);
      return { parentId: match.id, childKind: 'questions' as const, children };
    }
    return {
      create: { kind: 'quizzes' as const, fields: { name: quiz.name, ...(quiz.description === undefined ? {} : { description: quiz.description }) } },
      childKind: 'questions' as const,
      children,
    };
  });

/** Parses the editable JSON into the records to create. Parent IDs come from the chosen destination. Names that already exist are reused. */
export function compileBulkAddDraft(
  value: unknown,
  context: BulkAddContext,
  bank: StoredQuestionBank,
): { plan?: BulkPlan; errors: string[]; merged: string[] } {
  const parsed = parseBulkAddDraft(value, context);
  if (!parsed.draft) return { errors: parsed.errors, merged: [] };
  const draft = parsed.draft;
  const merged: string[] = [];
  if (context.kind === 'quiz') {
    if (!('items' in draft)) return { errors: ['Selected quiz draft must contain an items array.'], merged };
    const selectedQuiz = bank.quizzes.find((quiz) => quiz.id === context.quizId);
    if (!selectedQuiz || selectedQuiz.topicId !== context.topicId)
      return { errors: ['Selected quiz is not part of the selected topic.'], merged };
    return {
      plan: { topics: [{ groups: [{ parentId: selectedQuiz.id, childKind: 'questions', children: draft.items.map(itemFields) }] }] },
      errors: [],
      merged,
    };
  }
  const quizzesOf = (topicId: string) => bank.quizzes.filter((quiz) => quiz.topicId === topicId);
  if (context.kind === 'subject') {
    const { topics } = draft as { topics: BulkAddTopicDraft[] };
    const existing = bank.topics.filter((topic) => topic.subjectId === context.subjectId);
    return {
      plan: {
        subjectId: context.subjectId,
        topics: foldByName(topics, (into, topic) => ({ ...into, quizzes: [...into.quizzes, ...topic.quizzes] })).map((topic) => {
          const match = existing.find((row) => nameKey(row.name) === nameKey(topic.name));
          if (match) {
            merged.push(`Topic · ${match.name} · ${match.id}`);
            return { id: match.id, groups: quizGroups(topic.quizzes, quizzesOf(match.id), merged) };
          }
          return {
            fields: { name: topic.name, ...(topic.description === undefined ? {} : { description: topic.description }) },
            groups: quizGroups(topic.quizzes, [], merged),
          };
        }),
      },
      errors: [],
      merged,
    };
  }
  return {
    plan: { topics: [{ id: context.topicId, groups: quizGroups((draft as { quizzes: BulkAddQuizDraft[] }).quizzes, quizzesOf(context.topicId), merged) }] },
    errors: [],
    merged,
  };
}

/** Editable JSON contains content only; parent IDs and protocol fields live in panel state. */
export function bulkAddTemplate(context: BulkAddContext): BulkAddDraft {
  const item = { stem: '', choices: ['', ''], answer: 'A', rationale: '' };
  const quiz = { name: '', description: '', items: [{ ...item }] };
  if (context.kind === 'subject') return { topics: [{ name: '', description: '', quizzes: [quiz] }] };
  if (context.kind === 'topic') return { quizzes: [quiz] };
  return { items: [{ ...item }] };
}
