import { describe, expect, it } from 'vitest';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { bulkAddTemplate, compileBulkAddDraft, parseBulkAddDraft } from './bulkAddDraft';

const bank = (): StoredQuestionBank => ({
  schemaVersion: 4,
  subjects: [{ id: 's1', name: 'Subject', accent: '#111111' }],
  quizzes: [{ id: 'q1', subjectId: 's1', name: 'Quiz' }],
  questions: [{ id: 'i1', quizId: 'q1', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Rationale' }],
});
const item = (stem: string, extra: Record<string, unknown> = {}) => ({ stem, choices: ['Choice A', 'Choice B'], answer: 'B', rationale: 'Reason B', ...extra });
const choices = [{ id: 'A', text: 'Choice A' }, { id: 'B', text: 'Choice B' }];

describe('content-only bulk add drafts', () => {
  it('plans a new subject with quizzes and questions, labelling choices in order and assigning no IDs', () => {
    const result = compileBulkAddDraft(
      { subject: { name: 'Pearls' }, quizzes: [{ name: 'Pearls 1', items: [item('First'), item('Second')] }, { name: 'Pearls 2', items: [item('Third')] }] },
      { kind: 'newSubject' },
      bank(),
    );
    expect(result.errors).toEqual([]);
    expect(result.plan).toEqual({
      subject: { name: 'Pearls', accent: '#bc531e' },
      groups: [
        { create: { kind: 'quizzes', fields: { name: 'Pearls 1' } }, childKind: 'questions', children: [{ ...item('First'), choices }, { ...item('Second'), choices }] },
        { create: { kind: 'quizzes', fields: { name: 'Pearls 2' } }, childKind: 'questions', children: [{ ...item('Third'), choices }] },
      ],
    });
  });

  it('adds quizzes to an existing subject', () => {
    const result = compileBulkAddDraft({ quizzes: [{ name: 'Added', items: [item('One')] }] }, { kind: 'subject', subjectId: 's1' }, bank());
    expect(result.plan).toMatchObject({ subjectId: 's1', groups: [{ create: { kind: 'quizzes', fields: { name: 'Added' } } }] });
    expect(result.plan).not.toHaveProperty('subject');
  });

  it('adds items to an existing quiz, preserving provided versus verified answers', () => {
    const result = compileBulkAddDraft(
      { items: [item('Added', { answer: 'A', verifiedAnswer: 'B', answerNote: 'Source key reviewed separately' })] },
      { kind: 'quiz', subjectId: 's1', quizId: 'q1' },
      bank(),
    );
    expect(result.plan?.groups).toEqual([
      { parentId: 'q1', childKind: 'questions', children: [{ ...item('Added'), choices, answer: 'A', verifiedAnswer: 'B', answerNote: 'Source key reviewed separately' }] },
    ]);
  });

  it('refuses a quiz that is not under the selected subject', () => {
    expect(compileBulkAddDraft({ items: [item('X')] }, { kind: 'quiz', subjectId: 's2', quizId: 'q1' }, bank()).errors).toEqual([
      'Selected quiz is not part of the selected subject.',
    ]);
  });

  it('rejects technical IDs, parent references, unknown fields, and malformed choice labels', () => {
    const parsed = parseBulkAddDraft(
      { subject: { id: 's2', name: 'Pearls' }, quizzes: [{ id: 'q2', name: 'Quiz', items: [{ ...item('Stem'), id: 'i2', quizId: 'q2', answer: 'C' }] }] },
      { kind: 'newSubject' },
    );
    expect(parsed.errors).toContain('$.subject.id is managed by the admin panel or is not editable.');
    expect(parsed.errors).toContain('$.quizzes[0].id is not an editable quiz field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].id is not an editable item field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].quizId is not an editable item field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].answer must be one of the generated choice labels: A, B.');
  });

  it('supports all three template contexts without exposing identifiers', () => {
    const contexts = [{ kind: 'newSubject' as const }, { kind: 'subject' as const, subjectId: 's1' }, { kind: 'quiz' as const, subjectId: 's1', quizId: 'q1' }];
    for (const context of contexts) expect(JSON.stringify(bulkAddTemplate(context))).not.toMatch(/revision|reason|operations|\bid\b|subjectId|quizId/);
    expect(parseBulkAddDraft({ subject: { name: 'Pearls' }, quizzes: [{ name: 'Quiz', items: [item('Item')] }] }, contexts[0]).errors).toEqual([]);
    expect(parseBulkAddDraft({ quizzes: [{ name: 'Quiz', items: [item('Item')] }] }, contexts[1]).errors).toEqual([]);
    expect(parseBulkAddDraft({ items: [item('Item')] }, contexts[2]).errors).toEqual([]);
  });
});
