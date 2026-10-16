/** Form adapters patch one JSON draft. They never normalize untouched source or infer defaults. */
export type RecordKind = 'subject' | 'quiz' | 'question' | 'deck' | 'card';
export type DraftRecord = Record<string, unknown>;
export interface DraftChoice {
  id: string;
  text: string;
  [key: string]: unknown;
}
const fields: Record<RecordKind, readonly string[]> = {
  subject: ['name', 'accent'],
  quiz: ['name'],
  deck: ['name', 'description'],
  card: ['front', 'back', 'sources', 'reviewNote'],
  question: [
    'stem',
    'choices',
    'answer',
    'verifiedAnswer',
    'answerNote',
    'rationale',
    'rationaleMeta',
    'choiceExplanations',
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
        : kind === 'quiz'
          ? ['name', 'subjectId']
          : kind === 'deck'
            ? ['name', 'subjectId']
            : kind === 'card'
              ? ['front', 'back', 'deckId']
              : ['stem', 'rationale', 'quizId'];
    if (required.some((field) => typeof row[field] !== 'string')) return;
    const strings =
      kind === 'card'
        ? ['sources', 'reviewNote']
        : kind === 'deck'
          ? ['description']
          : kind === 'question'
            ? ['answer', 'verifiedAnswer', 'answerNote']
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
      for (const field of ['metadata', 'rationaleMeta', 'choiceExplanations']) {
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
        ['sources', 'answerReviewNote', 'provenance', 'reviewedAt', 'reviewNote'].some(
          (field) => Object.hasOwn(rationaleMeta, field) && typeof rationaleMeta[field] !== 'string',
        )
      )
        return;
      if (row.choiceExplanations && Object.values(row.choiceExplanations).some((v) => typeof v !== 'string')) return;
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
  existing = false,
): string {
  const row = readRecordDraft(text, kind);
  if (!row) throw new Error('Keep editing the JSON draft before using the form.');
  if (!fields[kind].includes(field) || (existing && field === 'answer'))
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
  field: 'metadata' | 'rationaleMeta' | 'choiceExplanations',
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
  if (
    !row ||
    !choices ||
    !choice ||
    choices.length <= 2 ||
    row.answer === choice.id ||
    row.verifiedAnswer === choice.id
  )
    throw new Error('Keep at least two choices and retain every referenced answer choice.');
  const explanations = row.choiceExplanations as DraftRecord | undefined;
  if (explanations && Object.hasOwn(explanations, choice.id))
    throw new Error('Remove the choice explanation explicitly before removing this choice.');
  return patchRecordDraft(
    text,
    'question',
    'choices',
    choices.filter((_, i) => i !== index),
  );
}

/** Only a server reservation may replace a new record's provisional ID after a committed save. */
export function adoptReservedDraftId(text: string, provisional: string, reserved: string): string {
  if (provisional === reserved) return text;
  try {
    const row: unknown = JSON.parse(text);
    if (!isDraftObject(row) || row.id !== provisional) return text;
    return JSON.stringify({ ...row, id: reserved }, null, 2);
  } catch {
    return text;
  }
}
