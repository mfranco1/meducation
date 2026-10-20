import { describe, expect, it } from 'vitest';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { bulkAddTemplate, compileBulkAddDraft, parseBulkAddDraft } from './bulkAddDraft';

const bank = (): StoredQuestionBank => ({
  schemaVersion: 6,
  subjects: [{ id: 's1', name: 'Subject', accent: '#111111' }],
  topics: [{ id: 't1', subjectId: 's1', name: 'Topic' }],
  quizzes: [{ id: 'q1', topicId: 't1', name: 'Quiz' }],
  questions: [{ id: 'i1', quizId: 'q1', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Rationale' }],
});
const item = (stem: string, extra: Record<string, unknown> = {}) => ({ stem, choices: ['Choice A', 'Choice B'], answer: 'B', rationale: 'Reason B', ...extra });
const choices = [{ id: 'A', text: 'Choice A' }, { id: 'B', text: 'Choice B' }];

describe('content-only bulk add drafts', () => {
  it('plans new topics in order, each with its own quizzes and questions, labelling choices and assigning no IDs', () => {
    const result = compileBulkAddDraft(
      {
        topics: [
          { name: 'Pearls', quizzes: [{ name: 'Pearls 1', items: [item('First'), item('Second')] }, { name: 'Pearls 2', items: [item('Third')] }] },
          { name: 'Traps', description: 'Topic text', quizzes: [{ name: 'Traps 1', description: 'Quiz text', items: [item('Fourth')] }] },
        ],
      },
      { kind: 'subject', subjectId: 's1' },
      bank(),
    );
    expect(result.errors).toEqual([]);
    expect(result.plan).toEqual({
      subjectId: 's1',
      topics: [
        {
          fields: { name: 'Pearls' },
          groups: [
            { create: { kind: 'quizzes', fields: { name: 'Pearls 1' } }, childKind: 'questions', children: [{ ...item('First'), choices }, { ...item('Second'), choices }] },
            { create: { kind: 'quizzes', fields: { name: 'Pearls 2' } }, childKind: 'questions', children: [{ ...item('Third'), choices }] },
          ],
        },
        {
          fields: { name: 'Traps', description: 'Topic text' },
          groups: [
            { create: { kind: 'quizzes', fields: { name: 'Traps 1', description: 'Quiz text' } }, childKind: 'questions', children: [{ ...item('Fourth'), choices }] },
          ],
        },
      ],
    });
    expect(compileBulkAddDraft({ quizzes: [{ name: 'Q', description: 5, items: [item('One')] }] }, { kind: 'topic', topicId: 't1' }, bank()).errors).toEqual(['$.quizzes[0].description must be a string.']);
  });

  it('leaves blank descriptions unset', () => {
    const result = compileBulkAddDraft(
      { topics: [{ name: 'Pearls', description: ' ', quizzes: [{ name: 'Q', description: '', items: [item('First')] }] }] },
      { kind: 'subject', subjectId: 's1' },
      bank(),
    );
    expect(result.plan?.topics[0].fields).toEqual({ name: 'Pearls' });
    expect(result.plan?.topics[0].groups[0].create?.fields).toEqual({ name: 'Q' });
  });

  it('adds quizzes to an existing topic', () => {
    const result = compileBulkAddDraft({ quizzes: [{ name: 'Added', items: [item('One')] }] }, { kind: 'topic', topicId: 't1' }, bank());
    expect(result.plan).toMatchObject({ topics: [{ id: 't1', groups: [{ create: { kind: 'quizzes', fields: { name: 'Added' } } }] }] });
    expect(result.plan?.topics[0]).not.toHaveProperty('fields');
  });

  it('adds items to an existing quiz', () => {
    const result = compileBulkAddDraft(
      { items: [item('Added', { answer: 'A' })] },
      { kind: 'quiz', topicId: 't1', quizId: 'q1' },
      bank(),
    );
    expect(result.plan?.topics).toEqual([
      { groups: [{ parentId: 'q1', childKind: 'questions', children: [{ ...item('Added'), choices, answer: 'A' }] }] },
    ]);
  });

  it('refuses a quiz that is not under the selected topic', () => {
    expect(compileBulkAddDraft({ items: [item('X')] }, { kind: 'quiz', topicId: 't2', quizId: 'q1' }, bank()).errors).toEqual([
      'Selected quiz is not part of the selected topic.',
    ]);
  });

  it('rejects technical IDs, parent references, unknown fields, and malformed choice labels with nested paths', () => {
    const parsed = parseBulkAddDraft(
      {
        topics: [
          { name: 'Fine', quizzes: [{ name: 'Quiz', items: [item('Stem')] }] },
          { id: 't2', name: 'Pearls', quizzes: [{ id: 'q2', name: 'Quiz', items: [{ ...item(''), id: 'i2', quizId: 'q2', answer: 'C' }] }] },
        ],
      },
      { kind: 'subject', subjectId: 's1' },
    );
    expect(parsed.errors).toContain('$.topics[1].id is managed by the admin panel or is not editable.');
    expect(parsed.errors).toContain('$.topics[1].quizzes[0].id is not an editable quiz field.');
    expect(parsed.errors).toContain('$.topics[1].quizzes[0].items[0].stem must be a non-empty string.');
    expect(parsed.errors).toContain('$.topics[1].quizzes[0].items[0].id is not an editable item field.');
    expect(parsed.errors).toContain('$.topics[1].quizzes[0].items[0].quizId is not an editable item field.');
    expect(parsed.errors).toContain('$.topics[1].quizzes[0].items[0].answer must be one of the generated choice labels: A, B.');
    expect(parseBulkAddDraft({ topic: { name: 'Old' }, quizzes: [] }, { kind: 'subject', subjectId: 's1' }).errors).toContain('$.topic is managed by the admin panel or is not editable in this template.');
  });

  it('supports all three template contexts without exposing identifiers', () => {
    const contexts = [{ kind: 'subject' as const, subjectId: 's1' }, { kind: 'topic' as const, topicId: 't1' }, { kind: 'quiz' as const, topicId: 't1', quizId: 'q1' }];
    for (const context of contexts) expect(JSON.stringify(bulkAddTemplate(context))).not.toMatch(/revision|reason|operations|\bid\b|subjectId|topicId|quizId/);
    expect(parseBulkAddDraft({ topics: [{ name: 'Pearls', quizzes: [{ name: 'Quiz', items: [item('Item')] }] }] }, contexts[0]).errors).toEqual([]);
    expect(parseBulkAddDraft({ quizzes: [{ name: 'Quiz', items: [item('Item')] }] }, contexts[1]).errors).toEqual([]);
    expect(parseBulkAddDraft({ items: [item('Item')] }, contexts[2]).errors).toEqual([]);
  });

  it('omits optional fields left blank and keeps filled ones', () => {
    const context = { kind: 'quiz' as const, topicId: 't1', quizId: 'q1' };
    const { items: [blank] } = bulkAddTemplate(context) as { items: Record<string, unknown>[] };
    const filled = { rationaleMeta: { sources: 'Guide p. 4' }, pearls: ['Pearl', ''], metadata: { topic: '', difficulty: 'hard', tags: ['tag', ''] } };
    const compiled = compileBulkAddDraft(
      { items: [{ ...blank, ...item('Blank'), metadata: { ...(blank.metadata as object), difficulty: '' } }, item('Filled', filled)] },
      context,
      bank(),
    );
    expect(compiled.errors).toEqual([]);
    expect(compiled.plan?.topics[0].groups[0].children).toEqual([
      { ...item('Blank'), choices },
      { ...item('Filled'), choices, rationaleMeta: { sources: 'Guide p. 4' }, pearls: ['Pearl'], metadata: { difficulty: 'hard', tags: ['tag'] } },
    ]);
    expect(parseBulkAddDraft({ items: [{ ...blank, ...item('Hint') }] }, context).errors).toEqual(['$.items[0].metadata.difficulty must be easy, medium, or hard.']);
  });

  it('reuses existing topics and quizzes by name, ignoring case and spaces, and reports them', () => {
    const result = compileBulkAddDraft(
      { topics: [{ name: ' TOPIC ', description: 'Ignored', quizzes: [{ name: 'quiz', items: [item('One')] }, { name: 'Other', items: [item('Two')] }] }] },
      { kind: 'subject', subjectId: 's1' },
      bank(),
    );
    expect(result.plan).toEqual({
      subjectId: 's1',
      topics: [
        {
          id: 't1',
          groups: [
            { parentId: 'q1', childKind: 'questions', children: [{ ...item('One'), choices }] },
            { create: { kind: 'quizzes', fields: { name: 'Other' } }, childKind: 'questions', children: [{ ...item('Two'), choices }] },
          ],
        },
      ],
    });
    expect(result.merged).toEqual(['Topic · Topic · t1', 'Quiz · Quiz · q1']);
  });

  it('reuses an existing quiz in the selected topic', () => {
    const result = compileBulkAddDraft({ quizzes: [{ name: 'Quiz', items: [item('One')] }] }, { kind: 'topic', topicId: 't1' }, bank());
    expect(result.plan).toEqual({ topics: [{ id: 't1', groups: [{ parentId: 'q1', childKind: 'questions', children: [{ ...item('One'), choices }] }] }] });
    expect(result.merged).toEqual(['Quiz · Quiz · q1']);
  });

  it('folds duplicate topics and quizzes in the batch, keeping the first description', () => {
    const result = compileBulkAddDraft(
      {
        topics: [
          { name: 'New', quizzes: [{ name: 'A', items: [item('One')] }] },
          { name: 'new ', description: 'Kept', quizzes: [{ name: 'a', description: 'Quiz kept', items: [item('Two')] }, { name: 'B', items: [item('Three')] }] },
        ],
      },
      { kind: 'subject', subjectId: 's1' },
      bank(),
    );
    expect(result.merged).toEqual([]);
    expect(result.plan?.topics).toEqual([
      {
        fields: { name: 'New', description: 'Kept' },
        groups: [
          { create: { kind: 'quizzes', fields: { name: 'A', description: 'Quiz kept' } }, childKind: 'questions', children: [{ ...item('One'), choices }, { ...item('Two'), choices }] },
          { create: { kind: 'quizzes', fields: { name: 'B' } }, childKind: 'questions', children: [{ ...item('Three'), choices }] },
        ],
      },
    ]);
  });
});
