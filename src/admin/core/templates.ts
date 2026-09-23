import type { StoredQuestionBank } from '../../content/schema';

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
