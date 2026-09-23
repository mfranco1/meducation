import { describe, expect, it } from 'vitest';
import type { StoredQuestionBank } from '../../content/schema';
import { previewChangeSet } from './applyChangeSet';
import type { AdminChangeSet } from './types';

const bank = (): StoredQuestionBank => ({
  schemaVersion: 4,
  subjects: [{ id: 's1', name: 'Subject', accent: '#111111' }],
  quizzes: [{ id: 'q1', subjectId: 's1', name: 'Quiz' }],
  questions: [{ id: 'i1', quizId: 'q1', stem: 'Stem', choices: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }], answer: 'A', rationale: 'Rationale' }],
});
const changeSet = (operations: AdminChangeSet['operations']): AdminChangeSet => ({ changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: 'test' }, reason: 'Test change', operations });

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
});
