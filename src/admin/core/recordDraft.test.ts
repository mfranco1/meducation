import { describe, expect, it } from 'vitest';
import { storedQuestionBank, storedFlashcardBank } from '../../test/contentFixtures';
import {
  addDraftChoice,
  adoptServerId,
  newRecordTemplate,
  planSave,
  toRecordText,
  moveDraftChoice,
  patchChoiceText,
  patchNestedDraft,
  patchRecordDraft,
  readRecordDraft,
  removeDraftChoice,
  type RecordKind,
} from './recordDraft';
const source = {
  ...storedQuestionBank.questions[0],
  choices: [
    { id: 'custom-2', text: '  $5,000 <b>A</b>\n' },
    { id: 'Z', text: '1.2 mg/kg\n\\alpha' },
    { id: 'AA', text: 'Third' },
  ],
  answer: 'custom-2',
  rationale: '  Exact <p>$x^2$</p>\n',
  rationaleMeta: { sources: '[source](https://example.com)' },
  metadata: { tags: [' exact ', 'a,b'], topic: 'Sparse' },
  pearls: ['  Exact\npearl'],
};
describe('exact-preserving record draft adapters', () => {
  it.each([
    ['subject', storedQuestionBank.subjects[0], 'name'],
    ['quiz', storedQuestionBank.quizzes[0], 'name'],
    ['question', source, 'stem'],
    ['deck', storedFlashcardBank.decks[0], 'name'],
    ['card', storedFlashcardBank.cards[0], 'front'],
  ] as const)('keeps the complete %s draft byte-for-byte on an unchanged field', (kind, row, field) => {
    const raw = JSON.stringify(row, null, 4) + '\n';
    expect(readRecordDraft(raw, kind)).toEqual(row);
    expect(patchRecordDraft(raw, kind, field, row[field as keyof typeof row])).toBe(raw);
  });
  it('patches only the authored field, retaining exact optional values, order and units', () => {
    const raw = JSON.stringify(source);
    const next = JSON.parse(patchRecordDraft(raw, 'question', 'stem', 'Intentional new stem\n$x^2$'));
    expect(next).toEqual({ ...source, stem: 'Intentional new stem\n$x^2$' });
    expect(source.choices.map((c) => c.id)).toEqual(['custom-2', 'Z', 'AA']);
    for (const field of ['id', 'quizId', 'subjectId', 'deckId'])
      expect(() => patchRecordDraft(raw, 'question', field, 'changed')).toThrow('read-only');
    expect(JSON.parse(patchRecordDraft(raw, 'question', 'answer', 'AA')).answer).toBe('AA');
  });
  it('preserves absent versus present empty optional fields and unknown extensions when editing another field', () => {
    const row = {
      id: 'f1',
      deckId: 'd1',
      front: 'Front',
      back: 'Back',
      sources: '',
      extension: { exact: [1, null, '  raw\n'] },
    };
    const raw = JSON.stringify(row);
    expect(JSON.parse(patchRecordDraft(raw, 'card', 'back', 'Changed'))).toEqual({ ...row, back: 'Changed' });
    expect(JSON.parse(patchRecordDraft(raw, 'card', 'sources', undefined))).not.toHaveProperty('sources');
  });
  it('patches sparse nested fields without creating unrelated defaults or losing nested values', () => {
    const raw = JSON.stringify(source);
    const next = JSON.parse(patchNestedDraft(raw, 'metadata', 'topic', 'New topic'));
    expect(next).toEqual({ ...source, metadata: { ...source.metadata, topic: 'New topic' } });
    const minimal = JSON.stringify({ ...source, metadata: undefined });
    const added = patchNestedDraft(minimal, 'metadata', 'topic', 'Exact');
    expect(JSON.parse(added).metadata).toEqual({ topic: 'Exact' });
    expect(JSON.parse(patchNestedDraft(added, 'metadata', 'topic', undefined))).not.toHaveProperty('metadata');
  });
  it('changes or moves choices explicitly without relabelling, reordering other choices or changing answer references', () => {
    const raw = JSON.stringify(source);
    const edited = JSON.parse(patchChoiceText(raw, 1, '  Changed $3.50$\n'));
    expect(edited).toEqual({
      ...source,
      choices: [source.choices[0], { ...source.choices[1], text: '  Changed $3.50$\n' }, source.choices[2]],
    });
    const moved = JSON.parse(moveDraftChoice(raw, 1, -1));
    expect(moved.choices).toEqual([source.choices[1], source.choices[0], source.choices[2]]);
    expect(moved.answer).toBe(source.answer);
    expect(moveDraftChoice(raw, 0, -1)).toBe(raw);
    expect(() => removeDraftChoice(raw, 0)).toThrow('answer choice');
    expect(JSON.parse(removeDraftChoice(raw, 2)).choices).toEqual(source.choices.slice(0, 2));
    expect(() => addDraftChoice(raw, 'Z')).toThrow('unique');
    expect(JSON.parse(addDraftChoice(raw, 'custom-new')).choices.at(-1)).toEqual({ id: 'custom-new', text: '' });
  });
  it.each([
    '{ exact invalid\n',
    'null',
    '[]',
    '{"id":"i1","stem":12}',
    JSON.stringify({ ...source, metadata: { topic: 12 } }),
  ])('keeps unrepresentable source out of the form', (raw) => {
    expect(readRecordDraft(raw, 'question')).toBeUndefined();
    expect(() => patchRecordDraft(raw, 'question', 'stem', 'No')).toThrow('JSON');
  });
  it('never admits relationship or ID edits for any record kind', () => {
    const rows: Array<[RecordKind, unknown]> = [
      ['subject', storedQuestionBank.subjects[0]],
      ['quiz', storedQuestionBank.quizzes[0]],
      ['deck', storedFlashcardBank.decks[0]],
      ['card', storedFlashcardBank.cards[0]],
    ];
    for (const [kind, row] of rows)
      expect(() => patchRecordDraft(JSON.stringify(row), kind, 'id', 'replacement')).toThrow('read-only');
  });
});

it('adopts the server ID only for a new record draft, keeping newer or invalid source exact', () => {
  const newer = { ...source, id: '', stem: 'Newer authored source\n$x^2$' };
  expect(JSON.parse(adoptServerId(JSON.stringify(newer), 'i91'))).toEqual({ ...newer, id: 'i91' });
  const invalid = '{ exact newer invalid\n';
  expect(adoptServerId(invalid, 'i91')).toBe(invalid);
  const different = JSON.stringify({ ...newer, id: 'deliberately-changed' });
  expect(adoptServerId(different, 'i91')).toBe(different);
});

describe('record save planning', () => {
  const stored = { ...storedQuestionBank.questions[0], version: 3 };
  it('shows the stored record without its concurrency version', () => {
    expect(JSON.parse(toRecordText(stored))).toEqual(storedQuestionBank.questions[0]);
  });
  it('patches only changed fields and removes optional fields the author deleted', () => {
    const edited = { ...storedQuestionBank.questions[0], stem: 'Changed', pearls: ['Added'] } as Record<string, unknown>;
    delete edited.rationale;
    const plan = planSave('question', JSON.stringify(edited), stored);
    expect(plan).toEqual({ fields: { stem: 'Changed', pearls: ['Added'], rationale: null }, parentId: stored.quizId, moveTo: undefined });
  });
  it('sends nothing for unchanged text and plans a move when only the parent changed', () => {
    expect(planSave('question', toRecordText(stored), stored)).toMatchObject({ fields: {}, moveTo: undefined });
    expect(planSave('question', JSON.stringify({ ...stored, quizId: 'q9' }), stored)).toMatchObject({ fields: {}, moveTo: 'q9' });
  });
  it('creates from every authored field, leaving the ID and parent to the server call', () => {
    const plan = planSave('quiz', JSON.stringify(newRecordTemplate('quiz', 's1')));
    expect(plan).toEqual({ fields: { name: '' }, parentId: 's1', moveTo: undefined });
    expect(planSave('subject', JSON.stringify(newRecordTemplate('subject')))).toMatchObject({ fields: { name: '', accent: '#bc531e' } });
  });
  it('refuses unusable text and ID changes before any request, and passes unknown fields to the server', () => {
    expect(planSave('question', '{ nope', stored)).toEqual({ error: 'Record JSON is invalid.' });
    expect(planSave('question', '[]', stored)).toEqual({ error: 'Record must be a JSON object.' });
    expect(planSave('question', JSON.stringify({ ...stored, id: 'i2' }), stored)).toEqual({
      error: 'IDs are stable and cannot be changed.',
    });
    expect(planSave('card', JSON.stringify({ id: '', deckId: '', front: 'a', back: 'b' }))).toEqual({
      error: 'deckId must name the parent record.',
    });
    expect(planSave('subject', JSON.stringify({ id: 's1', name: 'N', accent: '#fff', legacy: 1 }), { id: 's1', name: 'N', accent: '#fff' })).toMatchObject({
      fields: { legacy: 1 },
    });
  });
});
