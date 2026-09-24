import { describe, expect, it } from 'vitest';
import type { StoredQuestionBank } from '../../content/schema';
import { previewChangeSet } from './applyChangeSet';
import { compileBulkAddDraft, parseBulkAddDraft } from './bulkAddDraft';
import { bulkAddTemplate } from './templates';

const bank = (): StoredQuestionBank => ({
  schemaVersion: 4,
  subjects: [{ id: 's1', name: 'Subject', accent: '#111111' }],
  quizzes: [{ id: 'q1', subjectId: 's1', name: 'Quiz' }],
  questions: [{ id: 'i1', quizId: 'q1', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Rationale' }],
});
const revision = 'sha256-current';
const item = (stem: string, extra: Record<string, unknown> = {}) => ({ stem, choices: ['Choice A', 'Choice B'], answer: 'B', rationale: 'Reason B', ...extra });

describe('content-only bulk add drafts', () => {
  it('compiles a new subject and multiple quizzes with generated IDs and ordered choice labels', () => {
    const result = compileBulkAddDraft({
      subject: { name: 'Pearls' },
      quizzes: [
        { name: 'Pearls 1', items: [item('First'), item('Second')] },
        { name: 'Pearls 2', items: [item('Third')] },
      ],
    }, { kind: 'newSubject', revision }, bank(), revision, 'Add Pearls');

    expect(result.errors).toEqual([]);
    const operation = result.compiled?.changeSet.operations[0];
    expect(operation?.op).toBe('content.add');
    if (operation?.op !== 'content.add') return;
    expect(operation.subject).toEqual({ create: { id: 's2', name: 'Pearls', accent: '#bc531e' } });
    expect(operation.quizzes.map(block => 'create' in block.quiz ? block.quiz.create : block.quiz)).toEqual([
      { id: 'q2', name: 'Pearls 1' }, { id: 'q3', name: 'Pearls 2' },
    ]);
    expect(operation.quizzes.flatMap(block => block.items.map(question => ({ id: question.id, quizId: 'quizId' in question ? question.quizId : undefined, choices: question.choices, answer: question.answer })))).toEqual([
      { id: 'i2', quizId: undefined, choices: [{ id: 'A', text: 'Choice A' }, { id: 'B', text: 'Choice B' }], answer: 'B' },
      { id: 'i3', quizId: undefined, choices: [{ id: 'A', text: 'Choice A' }, { id: 'B', text: 'Choice B' }], answer: 'B' },
      { id: 'i4', quizId: undefined, choices: [{ id: 'A', text: 'Choice A' }, { id: 'B', text: 'Choice B' }], answer: 'B' },
    ]);
    expect(result.compiled?.generatedIds).toEqual(['s2', 'q2', 'q3', 'i2', 'i3', 'i4']);
  });

  it('inherits an existing subject and quiz and preserves provided versus verified answers', () => {
    const result = compileBulkAddDraft({ items: [item('Added', { answer: 'A', verifiedAnswer: 'B', answerNote: 'Source key reviewed separately' })] },
      { kind: 'quiz', subjectId: 's1', quizId: 'q1', revision }, bank(), revision, 'Add item');
    expect(result.errors).toEqual([]);
    const operation = result.compiled?.changeSet.operations[0];
    expect(operation?.op).toBe('content.add');
    if (operation?.op !== 'content.add') return;
    expect(operation.subject).toEqual({ existingId: 's1' });
    expect(operation.quizzes[0].quiz).toEqual({ existingId: 'q1' });
    expect(operation.quizzes[0].items[0]).toMatchObject({ id: 'i2', answer: 'A', verifiedAnswer: 'B', answerNote: 'Source key reviewed separately' });
  });

  it('adds multiple quizzes with their authored item counts to an existing subject', () => {
    const result = compileBulkAddDraft({
      quizzes: [
        { name: 'Added quiz one', items: [item('One'), item('Two')] },
        { name: 'Added quiz two', items: [item('Three')] },
      ],
    }, { kind: 'subject', subjectId: 's1', revision }, bank(), revision, 'Add quizzes');

    expect(result.errors).toEqual([]);
    expect(result.compiled?.generatedIds).toEqual(['q2', 'q3', 'i2', 'i3', 'i4']);
    if (!result.compiled) return;
    const preview = previewChangeSet(bank(), result.compiled.changeSet);
    expect(preview.issues).toEqual([]);
    expect(preview.bank.quizzes.filter(quiz => quiz.subjectId === 's1').map(quiz => quiz.id)).toEqual(['q1', 'q2', 'q3']);
    expect(preview.bank.questions.filter(question => question.quizId === 'q2').map(question => question.id)).toEqual(['i2', 'i3']);
    expect(preview.bank.questions.filter(question => question.quizId === 'q3').map(question => question.id)).toEqual(['i4']);
  });

  it('adds multiple items to an existing quiz in authored order', () => {
    const result = compileBulkAddDraft({ items: [item('First added'), item('Second added'), item('Third added')] },
      { kind: 'quiz', subjectId: 's1', quizId: 'q1', revision }, bank(), revision, 'Add items');

    expect(result.errors).toEqual([]);
    expect(result.compiled?.generatedIds).toEqual(['i2', 'i3', 'i4']);
    if (!result.compiled) return;
    const preview = previewChangeSet(bank(), result.compiled.changeSet);
    expect(preview.issues).toEqual([]);
    expect(preview.bank.questions.filter(question => question.quizId === 'q1').map(question => question.id)).toEqual(['i1', 'i2', 'i3', 'i4']);
  });

  it('rejects technical IDs, parent references, unknown fields, and malformed choice labels', () => {
    const parsed = parseBulkAddDraft({
      subject: { id: 's2', name: 'Pearls' },
      quizzes: [{ id: 'q2', name: 'Quiz', items: [{ ...item('Stem'), id: 'i2', quizId: 'q2', answer: 'C' }] }],
    }, { kind: 'newSubject', revision });
    expect(parsed.errors).toContain('$.subject.id is managed by the admin panel or is not editable.');
    expect(parsed.errors).toContain('$.quizzes[0].id is not an editable quiz field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].id is not an editable item field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].quizId is not an editable item field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].answer must be one of the generated choice labels: A, B.');
  });

  it('uses monotonic IDs, rejects stale drafts, and rejects an empty change reason', () => {
    const bankWithGaps = bank();
    bankWithGaps.subjects.push({ id: 's4', name: 'Older subject', accent: '#222222' });
    bankWithGaps.quizzes.push({ id: 'q7', subjectId: 's1', name: 'Older quiz' });
    bankWithGaps.questions.push({ id: 'i9', quizId: 'q7', stem: 'Older', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Reason' });
    const draft = { subject: { name: 'Pearls' }, quizzes: [{ name: 'Quiz', items: [item('New')] }] };
    const compiled = compileBulkAddDraft(draft, { kind: 'newSubject', revision }, bankWithGaps, revision, 'Add');
    expect(compiled.compiled?.generatedIds).toEqual(['s5', 'q8', 'i10']);
    expect(compileBulkAddDraft(draft, { kind: 'newSubject', revision }, bankWithGaps, 'new-revision', 'Add').errors[0]).toContain('older snapshot');
    expect(compileBulkAddDraft(draft, { kind: 'newSubject', revision }, bankWithGaps, revision, ' ').errors).toContain('Change reason is required.');
  });

  it('supports all three template contexts without exposing identifiers', () => {
    const contexts = [
      { kind: 'newSubject' as const, revision },
      { kind: 'subject' as const, subjectId: 's1', revision },
      { kind: 'quiz' as const, subjectId: 's1', quizId: 'q1', revision },
    ];
    for (const context of contexts) {
      const template = bulkAddTemplate(context);
      const serialized = JSON.stringify(template);
      expect(serialized).not.toMatch(/changeSetVersion|bankSchemaVersion|revision|reason|operations|\bid\b|subjectId|quizId|\bop\b/);
    }
    expect(parseBulkAddDraft({ subject: { name: 'Pearls' }, quizzes: [{ name: 'Quiz', items: [item('Item')] }] }, contexts[0]).errors).toEqual([]);
    expect(parseBulkAddDraft({ quizzes: [{ name: 'Quiz', items: [item('Item')] }] }, contexts[1]).errors).toEqual([]);
    expect(parseBulkAddDraft({ items: [item('Item')] }, contexts[2]).errors).toEqual([]);
  });
});
