import { describe, expect, it } from 'vitest';
import type { StoredQuestionBank } from '../../content/schema';
import { previewChangeSet } from './applyChangeSet';
import { parseChangeSet } from './changeSetSchema';
import { serializeBank } from './serializeBank';
import type { AdminChangeSet, ContentAddOperation } from './types';
import { InMemoryQuestionBankGateway } from '../data/InMemoryQuestionBankGateway';

const bank = (): StoredQuestionBank => ({
  schemaVersion: 4,
  subjects: [{ id: 's1', name: 'Subject', accent: '#111111' }],
  quizzes: [{ id: 'q1', subjectId: 's1', name: 'Quiz' }],
  questions: [{ id: 'i1', quizId: 'q1', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Rationale' }],
});
const changeSet = (operations: AdminChangeSet['operations']): AdminChangeSet => ({ changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: 'test' }, reason: 'Test change', operations });
const item = (id: string, stem = `Stem ${id}`) => ({ id, stem, choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: `Rationale ${id}` });
const grouped = (subject: ContentAddOperation['subject'], quizzes: ContentAddOperation['quizzes']): AdminChangeSet => ({
  changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: 'test' }, reason: 'Grouped add', operations: [{ op: 'content.add', subject, quizzes }],
});

describe('admin change-set processor', () => {
  it('applies a mixed create batch while preserving question grouping', () => {
    const preview = previewChangeSet(bank(), changeSet([
      { op: 'subject.create', value: { id: 's2', name: 'Second', accent: '#222222' } },
      { op: 'quiz.create', value: { id: 'q2', subjectId: 's2', name: 'Second quiz' } },
      { op: 'question.create', value: { id: 'i2', quizId: 'q2', stem: 'Second stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'B', rationale: 'Second rationale' } },
    ]));
    expect(preview.issues.filter(issue => issue.level === 'error')).toEqual([]);
    expect(preview.bank.questions.map(question => question.id)).toEqual(['i1', 'i2']);
    expect(preview.summary).toMatchObject({ creates: 3 });
  });

  it('rolls back a whole batch when its final operation is invalid', () => {
    const original = bank();
    const preview = previewChangeSet(original, changeSet([
      { op: 'subject.create', value: { id: 's2', name: 'Second', accent: '#222222' } },
      { op: 'quiz.create', value: { id: 'q2', subjectId: 'missing', name: 'Broken' } },
    ]));
    expect(preview.issues.some(issue => issue.level === 'error')).toBe(true);
    expect(preview.bank).toEqual(original);
  });

  it('requires explicit cascade deletion and reports the impact', () => {
    const denied = previewChangeSet(bank(), changeSet([{ op: 'subject.delete', id: 's1' }]));
    expect(denied.issues[0].message).toContain('cascade: true');
    const accepted = previewChangeSet(bank(), changeSet([{ op: 'subject.delete', id: 's1', cascade: true }]));
    expect(accepted.issues.filter(issue => issue.level === 'error')).toEqual([]);
    expect(accepted.summary).toMatchObject({ deletes: 1, cascadedQuizzes: 1, cascadedQuestions: 1 });
  });

  it('moves a question into a destination quiz segment', () => {
    const source = bank();
    source.quizzes.push({ id: 'q2', subjectId: 's1', name: 'Other quiz' });
    source.questions.push({ id: 'i3', quizId: 'q1', stem: 'Remaining stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Remaining rationale' });
    source.questions.push({ id: 'i2', quizId: 'q2', stem: 'Other stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'B', rationale: 'Other rationale' });
    const moved = { ...source.questions[0], quizId: 'q2' };
    const preview = previewChangeSet(source, changeSet([{ op: 'question.update', id: 'i1', value: moved }]));
    expect(preview.issues.filter(issue => issue.level === 'error')).toEqual([]);
    expect(preview.bank.questions.map(question => `${question.quizId}:${question.id}`)).toEqual(['q1:i3', 'q2:i2', 'q2:i1']);
  });

  it('creates a subject, multiple quizzes, and item lists without repeated parent IDs', () => {
    const preview = previewChangeSet(bank(), grouped(
      { create: { id: 's2', name: 'Pearls', accent: '#bc531e' } },
      [
        { quiz: { create: { id: 'q2', name: 'Pearls One' } }, items: [item('i2'), item('i3')] },
        { quiz: { create: { id: 'q3', name: 'Pearls Two' } }, items: [item('i4')] },
      ],
    ));
    expect(preview.issues.filter(issue => issue.level === 'error')).toEqual([]);
    expect(preview.bank.quizzes.slice(1)).toEqual([
      { id: 'q2', subjectId: 's2', name: 'Pearls One' },
      { id: 'q3', subjectId: 's2', name: 'Pearls Two' },
    ]);
    expect(preview.bank.questions.map(question => `${question.quizId}:${question.id}`)).toEqual(['q1:i1', 'q2:i2', 'q2:i3', 'q3:i4']);
    expect(preview.summary).toMatchObject({ creates: 6 });
  });

  it('adds items to an existing quiz and adds a quiz under an existing subject', () => {
    const addToQuiz = previewChangeSet(bank(), grouped(
      { existingId: 's1' },
      [{ quiz: { existingId: 'q1' }, items: [item('i2')] }],
    ));
    expect(addToQuiz.issues.filter(issue => issue.level === 'error')).toEqual([]);
    expect(addToQuiz.bank.questions.map(question => question.id)).toEqual(['i1', 'i2']);

    const addQuiz = previewChangeSet(bank(), grouped(
      { existingId: 's1' },
      [{ quiz: { create: { id: 'q2', name: 'New quiz' } }, items: [item('i2')] }],
    ));
    expect(addQuiz.issues.filter(issue => issue.level === 'error')).toEqual([]);
    expect(addQuiz.bank.quizzes[1].subjectId).toBe('s1');
    expect(addQuiz.bank.questions[1].quizId).toBe('q2');
  });

  it('reports path-specific failures for wrong ownership and duplicate item IDs', () => {
    const source = bank();
    source.subjects.push({ id: 's2', name: 'Other subject', accent: '#222222' });
    source.quizzes.push({ id: 'q2', subjectId: 's2', name: 'Other quiz' });
    const wrongOwner = previewChangeSet(source, grouped(
      { existingId: 's1' },
      [{ quiz: { existingId: 'q2' }, items: [item('i2')] }],
    ));
    expect(wrongOwner.issues[0].message).toContain('quizzes[0].quiz.existingId');

    const duplicateId = previewChangeSet(source, grouped(
      { existingId: 's1' },
      [{ quiz: { existingId: 'q1' }, items: [item('i1')] }],
    ));
    expect(duplicateId.issues[0].message).toContain('quizzes[0].items[0]');
  });

  it('runs answer and Markdown validation after inherited quiz IDs are expanded', () => {
    const badAnswer = previewChangeSet(bank(), grouped(
      { existingId: 's1' },
      [{ quiz: { existingId: 'q1' }, items: [{ ...item('i2'), answer: 'Z' }] }],
    ));
    expect(badAnswer.issues.some(issue => issue.level === 'error' && issue.questionId === 'i2' && issue.message.includes('Correct answer'))).toBe(true);

    const unsafeMarkdown = previewChangeSet(bank(), grouped(
      { existingId: 's1' },
      [{ quiz: { existingId: 'q1' }, items: [{ ...item('i2'), stem: '<img src=x>' }] }],
    ));
    expect(unsafeMarkdown.issues.some(issue => issue.level === 'error' && issue.questionId === 'i2' && issue.message.includes('raw HTML'))).toBe(true);
  });

  it('rejects nested parent IDs and malformed grouped envelopes with JSON paths', () => {
    const parsed = parseChangeSet({
      changeSetVersion: 2,
      base: { bankSchemaVersion: 4, revision: 'revision' },
      reason: 'Add content',
      operations: [{ op: 'content.add', subject: { existingId: 's1' }, quizzes: [{ quiz: { existingId: 'q1' }, items: [{ ...item('i2'), quizId: 'q1' }] }] }],
    });
    expect(parsed.errors).toEqual(['operations[0].quizzes[0].items[0] has an invalid item shape; omit quizId because it is inherited from the quiz block.']);

    const empty = parseChangeSet({ changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: 'r' }, reason: 'x', operations: [{ op: 'content.add', subject: { existingId: 's1' }, quizzes: [] }] });
    expect(empty.errors[0]).toContain('operations[0].quizzes must be a non-empty array');
  });

  it('keeps version-1 import working and replays grouped export to the identical flat bank', async () => {
    const legacy = parseChangeSet({ changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: 'legacy' }, reason: 'Legacy', operations: [{ op: 'question.create', value: { ...item('i2'), quizId: 'q1' } }] });
    expect(legacy.errors).toEqual([]);

    const source = bank();
    const firstGateway = new InMemoryQuestionBankGateway(source);
    const base = await firstGateway.load();
    const groupedSet = { ...grouped({ create: { id: 's2', name: 'Pearls', accent: '#bc531e' } }, [{ quiz: { create: { id: 'q2', name: 'New quiz' } }, items: [item('i2'), item('i3')] }]), base: { bankSchemaVersion: 4 as const, revision: base.revision } };
    await firstGateway.apply(groupedSet);
    const exportedOperations = firstGateway.appliedOperations();
    expect(exportedOperations).toEqual(groupedSet.operations);

    const replayGateway = new InMemoryQuestionBankGateway(source);
    const replayBase = await replayGateway.load();
    await replayGateway.apply({ ...groupedSet, base: { ...groupedSet.base, revision: replayBase.revision } });
    expect(serializeBank((await replayGateway.load()).bank)).toBe(serializeBank((await firstGateway.load()).bank));
  });

  it('undoes exactly one staged grouped batch', async () => {
    const source = bank();
    const gateway = new InMemoryQuestionBankGateway(source);
    const base = await gateway.load();
    const batch = { ...grouped({ existingId: 's1' }, [{ quiz: { existingId: 'q1' }, items: [item('i2')] }]), base: { bankSchemaVersion: 4 as const, revision: base.revision } };
    await gateway.apply(batch);
    expect(gateway.appliedOperations()).toEqual(batch.operations);
    const afterUndo = await gateway.undo();
    expect(afterUndo?.bank).toEqual(source);
    expect(gateway.appliedOperations()).toEqual([]);
  });
});
