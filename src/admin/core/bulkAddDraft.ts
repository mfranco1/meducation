import type { StoredQuestionBank, StoredSubject } from '../../content/schema';
import type { AdminChangeSet, ContentAddOperation, GroupedQuestionInput, GroupedQuizAdd, GroupedSubjectRef } from './types';

export type BulkAddContext =
  | { kind: 'newSubject'; revision: string }
  | { kind: 'subject'; subjectId: string; revision: string }
  | { kind: 'quiz'; subjectId: string; quizId: string; revision: string };

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
  | { subject: { name: string }; quizzes: BulkAddQuizDraft[] }
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

  if (context.kind === 'newSubject') {
    for (const key of Object.keys(value)) if (!['subject', 'quizzes'].includes(key)) errors.push(`$.${key} is managed by the admin panel or is not editable in this template.`);
    if (!isObject(value.subject)) errors.push('$.subject must contain editable subject content.');
    else {
      for (const key of Object.keys(value.subject)) if (key !== 'name') errors.push(`$.subject.${key} is managed by the admin panel or is not editable.`);
      if (!nonEmptyString(value.subject.name)) errors.push('$.subject.name must be a non-empty string.');
    }
    const parsed = parseQuizzes(value.quizzes, '$.quizzes');
    errors.push(...parsed.errors);
    return errors.length ? { errors } : { draft: { subject: { name: (value.subject as JsonObject).name as string }, quizzes: parsed.quizzes! }, errors };
  }

  for (const key of Object.keys(value)) if (key !== 'quizzes') errors.push(`$.${key} is managed by the admin panel or is not editable in this template.`);
  const parsed = parseQuizzes(value.quizzes, '$.quizzes');
  errors.push(...parsed.errors);
  return errors.length ? { errors } : { draft: { quizzes: parsed.quizzes! }, errors };
}

function nextId(prefix: 's' | 'q' | 'i', used: Set<string>, next: Map<string, number>): string {
  let candidate = next.get(prefix) ?? 1;
  while (used.has(`${prefix}${candidate}`)) candidate += 1;
  const id = `${prefix}${candidate}`;
  used.add(id);
  next.set(prefix, candidate + 1);
  return id;
}

function initialAllocator(bank: StoredQuestionBank): { used: Record<'s' | 'q' | 'i', Set<string>>; next: Map<string, number> } {
  const used = {
    s: new Set(bank.subjects.map(entity => entity.id)),
    q: new Set(bank.quizzes.map(entity => entity.id)),
    i: new Set(bank.questions.map(entity => entity.id)),
  };
  const afterMaximum = (prefix: 's' | 'q' | 'i', values: Set<string>) => {
    let candidate = values.size ? Math.max(...Array.from(values, id => Number(id.slice(1)) || 0)) + 1 : 1;
    while (values.has(`${prefix}${candidate}`)) candidate += 1;
    return candidate;
  };
  return { used, next: new Map([['s', afterMaximum('s', used.s)], ['q', afterMaximum('q', used.q)], ['i', afterMaximum('i', used.i)]]) };
}

function compileItems(items: BulkAddItemDraft[], allocator: ReturnType<typeof initialAllocator>, path: string, questionPaths: Record<string, string>): GroupedQuestionInput[] {
  return items.map((item, itemIndex) => {
    const id = nextId('i', allocator.used.i, allocator.next);
    const choices = item.choices.map((text, choiceIndex) => ({ id: choiceLabel(choiceIndex), text }));
    questionPaths[id] = `${path}[${itemIndex}]`;
    return { ...item, id, choices } as unknown as GroupedQuestionInput;
  });
}

export interface CompiledBulkAddDraft {
  changeSet: AdminChangeSet;
  questionPaths: Record<string, string>;
  generatedIds: string[];
}

export function compileBulkAddDraft(
  value: unknown,
  context: BulkAddContext,
  bank: StoredQuestionBank,
  currentRevision: string,
  reason: string,
): { compiled?: CompiledBulkAddDraft; errors: string[] } {
  if (context.revision !== currentRevision) return { errors: ['This draft was created from an older snapshot. Reload its template before staging.'] };
  if (!reason.trim()) return { errors: ['Change reason is required.'] };
  const parsed = parseBulkAddDraft(value, context);
  if (!parsed.draft) return { errors: parsed.errors };
  const draft = parsed.draft;

  const allocator = initialAllocator(bank);
  const questionPaths: Record<string, string> = {};
  if (context.kind === 'newSubject' && !('subject' in draft)) return { errors: ['New subject draft is missing subject content.'] };
  const subjectRef: GroupedSubjectRef = context.kind === 'newSubject'
    ? { create: { id: nextId('s', allocator.used.s, allocator.next), name: (draft as Extract<BulkAddDraft, { subject: { name: string } }>).subject.name, accent: '#bc531e' } satisfies StoredSubject }
    : { existingId: context.subjectId };
  const subjectId = 'create' in subjectRef ? subjectRef.create.id : subjectRef.existingId;

  let quizzesDraft: BulkAddQuizDraft[];
  let existingQuizId: string | undefined;
  if (context.kind === 'quiz') {
    if (!('items' in draft)) return { errors: ['Selected quiz draft must contain an items array.'] };
    existingQuizId = context.quizId;
    const selectedQuiz = bank.quizzes.find(quiz => quiz.id === existingQuizId);
    if (!selectedQuiz || selectedQuiz.subjectId !== subjectId) return { errors: ['Selected quiz is not part of the selected subject in this snapshot.'] };
    quizzesDraft = [{ name: selectedQuiz.name, items: draft.items }];
  } else {
    if ('items' in draft) return { errors: ['Subject draft must contain a quizzes array.'] };
    quizzesDraft = draft.quizzes;
  }

  const groupedQuizzes: GroupedQuizAdd[] = quizzesDraft.map((quizDraft, quizIndex) => {
    const quizPath = existingQuizId ? '$.items' : `$.quizzes[${quizIndex}].items`;
    const quizId = existingQuizId ?? nextId('q', allocator.used.q, allocator.next);
    const quiz = existingQuizId ? { existingId: quizId } : { create: { id: quizId, name: quizDraft.name } };
    return { quiz, items: compileItems(quizDraft.items, allocator, quizPath, questionPaths) };
  });

  const operation: ContentAddOperation = { op: 'content.add', subject: subjectRef, quizzes: groupedQuizzes };
  const allocated = [
    ...('create' in subjectRef ? [subjectRef.create.id] : []),
    ...groupedQuizzes.flatMap(quiz => 'create' in quiz.quiz ? [quiz.quiz.create.id] : []),
    ...Object.keys(questionPaths),
  ];
  return {
    compiled: {
      changeSet: { changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: context.revision }, reason, operations: [operation] },
      questionPaths,
      generatedIds: allocated,
    },
    errors: [],
  };
}
