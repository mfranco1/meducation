/** Form adapters patch one JSON draft. They never normalize untouched source or infer defaults. */
export type RecordKind = 'subject' | 'topic' | 'quiz' | 'question' | 'deck' | 'card';
export type DraftRecord = Record<string, unknown>;
export interface DraftChoice {
  id: string;
  text: string;
  [key: string]: unknown;
}
const fields: Record<RecordKind, readonly string[]> = {
  subject: ['name', 'accent', 'description'],
  topic: ['name', 'description'],
  quiz: ['name', 'description'],
  deck: ['name', 'description'],
  card: ['front', 'back', 'sources'],
  question: [
    'stem',
    'choices',
    'answer',
    'rationale',
    'rationaleMeta',
    'pearls',
    'metadata',
  ],
};
export function isDraftObject(value: unknown): value is DraftRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function readRecordDraft(text: string, kind: RecordKind): DraftRecord | undefined {
  try {
    const row: unknown = JSON.parse(text);
    if (!isDraftObject(row) || typeof row.id !== 'string') return;
    const required =
      kind === 'subject'
        ? ['name', 'accent']
        : kind === 'topic'
          ? ['name', 'subjectId']
          : kind === 'quiz' || kind === 'deck'
            ? ['name', 'topicId']
            : kind === 'card'
              ? ['front', 'back', 'deckId']
              : ['stem', 'rationale', 'quizId'];
    if (required.some((field) => typeof row[field] !== 'string')) return;
    const strings =
      kind === 'card'
        ? ['sources']
        : kind === 'deck' || kind === 'subject' || kind === 'topic' || kind === 'quiz'
          ? ['description']
          : kind === 'question'
            ? ['answer']
            : [];
    if (strings.some((field) => Object.hasOwn(row, field) && typeof row[field] !== 'string')) return;
    if (kind === 'question') {
      if (
        !Array.isArray(row.choices) ||
        row.choices.some(
          (choice) => !isDraftObject(choice) || typeof choice.id !== 'string' || typeof choice.text !== 'string',
        )
      )
        return;
      if (new Set(row.choices.map((choice) => choice.id)).size !== row.choices.length) return;
      for (const field of ['metadata', 'rationaleMeta']) {
        if (Object.hasOwn(row, field) && !isDraftObject(row[field])) return;
      }
      if (row.pearls !== undefined && (!Array.isArray(row.pearls) || row.pearls.some((v) => typeof v !== 'string')))
        return;
      const metadata = row.metadata as DraftRecord | undefined;
      if (metadata) {
        if (
          ['topic', 'subtopic', 'system', 'difficulty', 'questionType'].some(
            (field) => Object.hasOwn(metadata, field) && typeof metadata[field] !== 'string',
          )
        )
          return;
        if (
          metadata.tags !== undefined &&
          (!Array.isArray(metadata.tags) || metadata.tags.some((v) => typeof v !== 'string'))
        )
          return;
      }
      const rationaleMeta = row.rationaleMeta as DraftRecord | undefined;
      if (
        rationaleMeta &&
        Object.hasOwn(rationaleMeta, 'sources') &&
        typeof rationaleMeta.sources !== 'string'
      )
        return;
    }
    return row;
  } catch {
    return;
  }
}
export function patchRecordDraft(
  text: string,
  kind: RecordKind,
  field: string,
  value: unknown,
): string {
  const row = readRecordDraft(text, kind);
  if (!row) throw new Error('Keep editing the JSON draft before using the form.');
  if (!fields[kind].includes(field))
    throw new Error(
      'This field is read-only in the form. Use deliberate advanced JSON editing for source corrections.',
    );
  if (value === undefined && !Object.hasOwn(row, field)) return text;
  if (value !== undefined && JSON.stringify(row[field]) === JSON.stringify(value)) return text;
  const next = { ...row, [field]: value };
  if (value === undefined) delete next[field];
  return JSON.stringify(next, null, 2);
}
export function patchNestedDraft(
  text: string,
  field: 'metadata' | 'rationaleMeta',
  key: string,
  value: unknown,
): string {
  const row = readRecordDraft(text, 'question');
  if (!row) throw new Error('Keep editing the JSON draft before using the form.');
  const previous = (row[field] ?? {}) as DraftRecord;
  if (value === undefined && !Object.hasOwn(previous, key)) return text;
  if (value !== undefined && JSON.stringify(previous[key]) === JSON.stringify(value)) return text;
  const next = { ...previous, [key]: value };
  if (value === undefined) delete next[key];
  return patchRecordDraft(text, 'question', field, Object.keys(next).length ? next : undefined);
}
export function patchChoiceText(text: string, index: number, value: string): string {
  const row = readRecordDraft(text, 'question');
  const choices = row?.choices as DraftChoice[] | undefined;
  if (!choices?.[index]) throw new Error('The selected choice is no longer present.');
  return patchRecordDraft(
    text,
    'question',
    'choices',
    choices.map((choice, i) => (i === index ? { ...choice, text: value } : choice)),
  );
}
export function moveDraftChoice(text: string, index: number, direction: -1 | 1): string {
  const row = readRecordDraft(text, 'question');
  const choices = row?.choices as DraftChoice[] | undefined;
  if (!choices?.[index] || !choices[index + direction]) return text;
  const next = [...choices];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return patchRecordDraft(text, 'question', 'choices', next);
}
export function addDraftChoice(text: string, id: string): string {
  const row = readRecordDraft(text, 'question');
  const choices = row?.choices as DraftChoice[] | undefined;
  if (!choices || !id.trim() || choices.some((choice) => choice.id === id))
    throw new Error('Enter a unique, non-empty choice ID. Existing choice IDs are never relabelled.');
  return patchRecordDraft(text, 'question', 'choices', [...choices, { id, text: '' }]);
}
export function removeDraftChoice(text: string, index: number): string {
  const row = readRecordDraft(text, 'question');
  const choices = row?.choices as DraftChoice[] | undefined;
  const choice = choices?.[index];
  if (!row || !choices || !choice || choices.length <= 2 || row.answer === choice.id)
    throw new Error('Keep at least two choices and retain the answer choice.');
  return patchRecordDraft(
    text,
    'question',
    'choices',
    choices.filter((_, i) => i !== index),
  );
}

/** Server-assigned IDs: a new record is drafted with an empty ID that the server fills in. */
export function adoptServerId(text: string, id: string): string {
  try {
    const row: unknown = JSON.parse(text);
    if (!isDraftObject(row) || row.id !== '') return text;
    return JSON.stringify({ ...row, id }, null, 2);
  } catch {
    return text;
  }
}

export const PARENT_KEY: Partial<Record<RecordKind, string>> = {
  topic: 'subjectId',
  quiz: 'topicId',
  question: 'quizId',
  deck: 'topicId',
  card: 'deckId',
};
/** The editable JSON of a stored record: the server's concurrency token is not authored content. */
export function toRecordText(record: object): string {
  const content = { ...(record as DraftRecord) };
  delete content.version;
  return JSON.stringify(content, null, 2);
}
export function newRecordTemplate(kind: RecordKind, parentId = ''): DraftRecord {
  switch (kind) {
    case 'subject':
      return { id: '', name: '', accent: '#bc531e' };
    case 'topic':
      return { id: '', subjectId: parentId, name: '' };
    case 'quiz':
      return { id: '', topicId: parentId, name: '' };
    case 'question':
      return {
        id: '',
        quizId: parentId,
        stem: '',
        choices: [
          { id: 'A', text: '' },
          { id: 'B', text: '' },
        ],
        answer: 'A',
        rationale: '',
      };
    case 'deck':
      return { id: '', topicId: parentId, name: 'New deck' };
    case 'card':
      return { id: '', deckId: parentId, front: 'Question', back: 'Answer' };
  }
}

/** Turns edited JSON into what the server needs: a field patch, and a new parent if the relationship changed. */
export function planSave(
  kind: RecordKind,
  text: string,
  baseline?: DraftRecord,
): { error: string } | { fields: DraftRecord; parentId?: string; moveTo?: string } {
  let row: unknown;
  try {
    row = JSON.parse(text);
  } catch {
    return { error: 'Record JSON is invalid.' };
  }
  if (!isDraftObject(row)) return { error: 'Record must be a JSON object.' };
  if (baseline && row.id !== baseline.id) return { error: 'IDs are stable and cannot be changed.' };
  const parentKey = PARENT_KEY[kind];
  const parentId = parentKey ? row[parentKey] : undefined;
  if (parentKey && (typeof parentId !== 'string' || !parentId))
    return { error: `${parentKey} must name the parent record.` };
  const patch: DraftRecord = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'version' || key === parentKey) continue;
    if (!baseline || JSON.stringify(baseline[key]) !== JSON.stringify(value)) patch[key] = value;
  }
  if (baseline)
    for (const key of editableFields(kind)) if (Object.hasOwn(baseline, key) && !Object.hasOwn(row, key)) patch[key] = null;
  return {
    fields: patch,
    parentId: parentId as string | undefined,
    moveTo: baseline && parentKey && baseline[parentKey] !== parentId ? (parentId as string) : undefined,
  };
}
export const editableFields = (kind: RecordKind): readonly string[] => fields[kind];
