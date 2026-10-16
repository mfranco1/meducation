import { describe, expect, it } from 'vitest';
import { storedQuestionBank, storedFlashcardBank } from '../../test/contentFixtures';
import {
  addDraftChoice,
  adoptReservedDraftId,
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
  verifiedAnswer: 'Z',
  answerNote: 'Original answer retained',
  rationale: '  Exact <p>$x^2$</p>\n',
  rationaleMeta: { provenance: 'source_migrated', sources: '[source](https://example.com)' },
  metadata: { tags: [' exact ', 'a,b'], topic: 'Sparse' },
  pearls: ['  Exact\npearl'],
  choiceExplanations: { Z: 'Restricted **source**' },
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
  it('patches only the authored field, retaining exact optional values, order, units and answer provenance', () => {
    const raw = JSON.stringify(source);
    const next = JSON.parse(patchRecordDraft(raw, 'question', 'stem', 'Intentional new stem\n$x^2$'));
    expect(next).toEqual({ ...source, stem: 'Intentional new stem\n$x^2$' });
    expect(source.choices.map((c) => c.id)).toEqual(['custom-2', 'Z', 'AA']);
    expect(() => patchRecordDraft(raw, 'question', 'answer', 'AA', true)).toThrow('read-only');
    for (const field of ['id', 'quizId', 'subjectId', 'deckId'])
      expect(() => patchRecordDraft(raw, 'question', field, 'changed')).toThrow('read-only');
    expect(JSON.parse(patchRecordDraft(raw, 'question', 'verifiedAnswer', 'AA', true)).answer).toBe('custom-2');
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
    expect(patchRecordDraft(raw, 'card', 'reviewNote', undefined)).toBe(raw);
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
    expect(moved.verifiedAnswer).toBe(source.verifiedAnswer);
    expect(moveDraftChoice(raw, 0, -1)).toBe(raw);
    expect(() => removeDraftChoice(raw, 0)).toThrow('referenced');
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

it('adopts only the committed reservation ID in newer valid drafts and keeps invalid or deliberately changed source exact', () => {
  const newer = { ...source, id: 'provisional', stem: 'Newer authored source\n$x^2$' };
  expect(JSON.parse(adoptReservedDraftId(JSON.stringify(newer), 'provisional', 'i-reserved'))).toEqual({
    ...newer,
    id: 'i-reserved',
  });
  const invalid = '{ exact newer invalid\n';
  expect(adoptReservedDraftId(invalid, 'provisional', 'i-reserved')).toBe(invalid);
  const different = JSON.stringify({ ...newer, id: 'deliberately-changed' });
  expect(adoptReservedDraftId(different, 'provisional', 'i-reserved')).toBe(different);
});
