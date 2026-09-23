import type { Question, Quiz, Subject } from '../domain/types';
import type { StoredQuestionBank } from './schema';

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  questionId?: string;
}

export function validateQuestionBank(subjects: Subject[], quizzes: Quiz[], questions: Question[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const subjectIds = new Set<string>();
  const quizById = new Map<string, Quiz>();
  const seenQuestionIds = new Set<string>();
  const closedQuizIds = new Set<string>();
  let currentQuizId: string | undefined;

  subjects.forEach(subject => {
    if (!subject.id) issues.push({ level: 'error', message: 'Missing subject ID' });
    else if (subjectIds.has(subject.id)) issues.push({ level: 'error', message: `Duplicate subject ID: ${subject.id}` });
    else subjectIds.add(subject.id);
  });

  quizzes.forEach(quiz => {
    if (!quiz.id) issues.push({ level: 'error', message: 'Missing quiz ID' });
    else if (quizById.has(quiz.id)) issues.push({ level: 'error', message: `Duplicate quiz ID: ${quiz.id}` });
    else quizById.set(quiz.id, quiz);
    if (!subjectIds.has(quiz.subjectId)) issues.push({ level: 'error', message: `Quiz ${quiz.id} has an invalid subject reference` });
  });

  questions.forEach(question => {
    const error = (message: string) => issues.push({ level: 'error', message, questionId: question.id });
    if (!question.id) error('Missing question ID');
    else if (seenQuestionIds.has(question.id)) error('Duplicate question ID');
    else seenQuestionIds.add(question.id);

    if (!question.stem.trim()) error('Empty stem');
    if (!question.rationale?.trim()) error('Missing rationale Markdown');
    if (!question.quizId || !quizById.has(question.quizId)) error('Invalid quiz reference');
    if (currentQuizId && currentQuizId !== question.quizId) closedQuizIds.add(currentQuizId);
    if (closedQuizIds.has(question.quizId)) error('Questions for a quiz must be contiguous to preserve canonical order');
    currentQuizId = question.quizId;

    if (question.choices.length < 2 || question.choices.some(choice => !choice.id || !choice.text.trim())) error('Missing or empty choices');
    if (new Set(question.choices.map(choice => choice.id)).size !== question.choices.length) error('Duplicate choice IDs');
    const answer = question.verifiedAnswer ?? question.answer;
    if (!answer || !question.choices.some(choice => choice.id === answer)) error('Correct answer does not reference a choice');
    if (question.metadata.difficulty && !['easy', 'medium', 'hard', 'unknown'].includes(question.metadata.difficulty)) error('Invalid difficulty');
    if (question.choiceExplanations && Object.keys(question.choiceExplanations).some(id => !question.choices.some(choice => choice.id === id))) error('Choice explanation references unknown choice');
  });

  quizzes.forEach(quiz => {
    if (!questions.some(question => question.quizId === quiz.id)) issues.push({ level: 'error', message: `Quiz ${quiz.id} has no questions` });
  });
  return issues;
}

export function validateStoredQuestionBank(bank: StoredQuestionBank): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (bank.schemaVersion !== 4) issues.push({ level: 'error', message: `Unsupported question bank schema version: ${bank.schemaVersion}` });
  bank.subjects.forEach(subject => {
    if ('description' in subject) issues.push({ level: 'error', message: `Subject ${subject.id} stores a redundant description` });
  });
  bank.quizzes.forEach(quiz => {
    if ('questionCount' in quiz) issues.push({ level: 'error', message: `Quiz ${quiz.id} stores a derived question count` });
  });
  bank.subjects.forEach(subject => {
    if (!/^s[1-9]\d*$/.test(subject.id)) issues.push({ level: 'error', message: `Subject ${subject.id} does not use a compact ID` });
  });
  bank.quizzes.forEach(quiz => {
    if (!/^q[1-9]\d*$/.test(quiz.id)) issues.push({ level: 'error', message: `Quiz ${quiz.id} does not use a compact ID` });
  });
  bank.questions.forEach(question => {
    const error = (message: string) => issues.push({ level: 'error', message, questionId: question.id });
    if (!/^i[1-9]\d*$/.test(question.id)) error('Question does not use a compact ID');
    if ('subjectId' in question) error('Question stores a redundant subject reference');
    if ('questionNumber' in question) error('Question stores a derived array position');
    if ('answerSource' in question) error('Question stores a derived answer source');
    if ('sourceAnswer' in question) error('Question uses the legacy sourceAnswer field');
    if (!question.metadata) return;
    if ('discipline' in question.metadata) error('Question metadata stores a duplicated discipline');
    if (question.metadata.difficulty === 'unknown') error('Question metadata stores a default difficulty');
    if (!Object.values(question.metadata).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))) error('Question stores an empty metadata object');
  });
  return issues;
}
