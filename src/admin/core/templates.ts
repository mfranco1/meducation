import type { StoredQuestionBank } from '../../content/schema';
import type { BulkAddContext, BulkAddDraft } from './bulkAddDraft';

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

/** Editable JSON contains content only; parent IDs and protocol fields live in panel state. */
export function bulkAddTemplate(context: BulkAddContext): BulkAddDraft {
  const item = { stem: '', choices: ['', ''], answer: 'A', rationale: '' };
  if (context.kind === 'newSubject') return {
    subject: { name: '' },
    quizzes: [{ name: '', items: [{ ...item }] }],
  };
  if (context.kind === 'subject') return { quizzes: [{ name: '', items: [{ ...item }] }] };
  return { items: [{ ...item }] };
}
