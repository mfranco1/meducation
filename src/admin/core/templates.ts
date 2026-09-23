import type { StoredQuestionBank } from '../../content/schema';
import type { AdminChangeSet, GroupedQuestionInput, GroupedQuizAdd, GroupedSubjectRef } from './types';

function nextId(bank: StoredQuestionBank, prefix: 's' | 'q' | 'i'): string {
  const values = prefix === 's' ? bank.subjects : prefix === 'q' ? bank.quizzes : bank.questions;
  const maximum = values.reduce((largest, value) => Math.max(largest, Number(value.id.slice(1)) || 0), 0);
  return `${prefix}${maximum + 1}`;
}

export const newSubject = (bank: StoredQuestionBank) => ({ id: nextId(bank, 's'), name: '', accent: '#bc531e' });
export const newQuiz = (bank: StoredQuestionBank, subjectId = '') => ({ id: nextId(bank, 'q'), subjectId, name: '' });
export const newQuestion = (bank: StoredQuestionBank, quizId = '') => ({
  id: nextId(bank, 'i'), quizId, stem: '', choices: [{ id: 'A', text: '' }, { id: 'B', text: '' }], answer: 'A', rationale: '',
});

function itemTemplate(bank: StoredQuestionBank): GroupedQuestionInput {
  const { quizId: _quizId, ...item } = newQuestion(bank, 'inherited');
  return item;
}

function quizBlock(bank: StoredQuestionBank, quizId?: string): GroupedQuizAdd {
  const quiz = quizId
    ? { existingId: quizId }
    : { create: { id: nextId(bank, 'q'), name: 'New quiz name' } };
  return { quiz, items: [itemTemplate(bank)] };
}

/** A useful grouped-add JSON template for the admin bulk editor. */
export function groupedAddTemplate(
  bank: StoredQuestionBank,
  revision: string,
  reason: string,
  context: { subjectId?: string; quizId?: string } = {},
): AdminChangeSet {
  const existingQuiz = context.quizId ? bank.quizzes.find(quiz => quiz.id === context.quizId) : undefined;
  const existingSubjectId = existingQuiz?.subjectId ?? context.subjectId;
  const subject: GroupedSubjectRef = existingSubjectId
    ? { existingId: existingSubjectId }
    : { create: newSubject(bank) };
  const quizzes = existingQuiz
    ? [quizBlock(bank, existingQuiz.id)]
    : [quizBlock(bank)];
  return {
    changeSetVersion: 2,
    base: { bankSchemaVersion: 4, revision },
    reason,
    operations: [{ op: 'content.add', subject, quizzes }],
  };
}
