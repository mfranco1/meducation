import { describe, expect, it } from 'vitest';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { bulkAddTemplate, compileBulkAddDraft, parseBulkAddDraft } from './bulkAddDraft';

const bank = (): StoredQuestionBank => ({
  schemaVersion: 5,
  subjects: [{ id: 's1', name: 'Subject', accent: '#111111' }],
  topics: [{ id: 't1', subjectId: 's1', name: 'Topic' }],
  quizzes: [{ id: 'q1', topicId: 't1', name: 'Quiz' }],
  questions: [{ id: 'i1', quizId: 'q1', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Rationale' }],
});
const item = (stem: string, extra: Record<string, unknown> = {}) => ({ stem, choices: ['Choice A', 'Choice B'], answer: 'B', rationale: 'Reason B', ...extra });
const choices = [{ id: 'A', text: 'Choice A' }, { id: 'B', text: 'Choice B' }];

describe('content-only bulk add drafts', () => {
  it('plans a new topic with quizzes and questions, labelling choices in order and assigning no IDs', () => {
    const result = compileBulkAddDraft(
      { topic: { name: 'Pearls' }, quizzes: [{ name: 'Pearls 1', items: [item('First'), item('Second')] }, { name: 'Pearls 2', items: [item('Third')] }] },
      { kind: 'newTopic', subjectId: 's1' },
      bank(),
    );
    expect(result.errors).toEqual([]);
    expect(result.plan).toEqual({
      subjectId: 's1',
      topic: { name: 'Pearls' },
      groups: [
        { create: { kind: 'quizzes', fields: { name: 'Pearls 1' } }, childKind: 'questions', children: [{ ...item('First'), choices }, { ...item('Second'), choices }] },
        { create: { kind: 'quizzes', fields: { name: 'Pearls 2' } }, childKind: 'questions', children: [{ ...item('Third'), choices }] },
      ],
    });
  });

  it('adds quizzes to an existing topic', () => {
    const result = compileBulkAddDraft({ quizzes: [{ name: 'Added', items: [item('One')] }] }, { kind: 'topic', topicId: 't1' }, bank());
    expect(result.plan).toMatchObject({ topicId: 't1', groups: [{ create: { kind: 'quizzes', fields: { name: 'Added' } } }] });
    expect(result.plan).not.toHaveProperty('topic');
  });

  it('adds items to an existing quiz, preserving provided versus verified answers', () => {
    const result = compileBulkAddDraft(
      { items: [item('Added', { answer: 'A', verifiedAnswer: 'B', answerNote: 'Source key reviewed separately' })] },
      { kind: 'quiz', topicId: 't1', quizId: 'q1' },
      bank(),
    );
    expect(result.plan?.groups).toEqual([
      { parentId: 'q1', childKind: 'questions', children: [{ ...item('Added'), choices, answer: 'A', verifiedAnswer: 'B', answerNote: 'Source key reviewed separately' }] },
    ]);
  });

  it('refuses a quiz that is not under the selected topic', () => {
    expect(compileBulkAddDraft({ items: [item('X')] }, { kind: 'quiz', topicId: 't2', quizId: 'q1' }, bank()).errors).toEqual([
      'Selected quiz is not part of the selected topic.',
    ]);
  });

  it('rejects technical IDs, parent references, unknown fields, and malformed choice labels', () => {
    const parsed = parseBulkAddDraft(
      { topic: { id: 't2', name: 'Pearls' }, quizzes: [{ id: 'q2', name: 'Quiz', items: [{ ...item('Stem'), id: 'i2', quizId: 'q2', answer: 'C' }] }] },
      { kind: 'newTopic', subjectId: 's1' },
    );
    expect(parsed.errors).toContain('$.topic.id is managed by the admin panel or is not editable.');
    expect(parsed.errors).toContain('$.quizzes[0].id is not an editable quiz field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].id is not an editable item field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].quizId is not an editable item field.');
    expect(parsed.errors).toContain('$.quizzes[0].items[0].answer must be one of the generated choice labels: A, B.');
  });

  it('supports all three template contexts without exposing identifiers', () => {
    const contexts = [{ kind: 'newTopic' as const, subjectId: 's1' }, { kind: 'topic' as const, topicId: 't1' }, { kind: 'quiz' as const, topicId: 't1', quizId: 'q1' }];
    for (const context of contexts) expect(JSON.stringify(bulkAddTemplate(context))).not.toMatch(/revision|reason|operations|\bid\b|subjectId|topicId|quizId/);
    expect(parseBulkAddDraft({ topic: { name: 'Pearls' }, quizzes: [{ name: 'Quiz', items: [item('Item')] }] }, contexts[0]).errors).toEqual([]);
    expect(parseBulkAddDraft({ quizzes: [{ name: 'Quiz', items: [item('Item')] }] }, contexts[1]).errors).toEqual([]);
    expect(parseBulkAddDraft({ items: [item('Item')] }, contexts[2]).errors).toEqual([]);
  });
});
