import type { StoredQuestion, StoredQuestionBank, StoredQuiz, StoredSubject } from '../../content/schema';
import type { ValidationIssue } from '../../content/validate';
import { cloneBank } from './serializeBank';
import { validateAdminBank } from './validateAdminBank';
import type { AdminChangePreview, AdminChangeSet, AdminOperation, ContentAddOperation } from './types';

class OperationError extends Error {}

const summary = () => ({ creates: 0, updates: 0, deletes: 0, moves: 0, cascadedQuestions: 0, cascadedQuizzes: 0 });
const byId = <T extends { id: string }>(items: T[], id: string) => items.findIndex(item => item.id === id);
const requireIndex = <T extends { id: string }>(items: T[], id: string, kind: string) => {
  const index = byId(items, id);
  if (index < 0) throw new OperationError(`${kind} ${id} does not exist.`);
  return index;
};
const requireNew = <T extends { id: string }>(items: T[], id: string, kind: string) => {
  if (byId(items, id) >= 0) throw new OperationError(`${kind} ${id} already exists.`);
};

function insertTopLevel<T extends { id: string }>(items: T[], value: T, afterId?: string): void {
  if (!afterId) { items.push(value); return; }
  const index = requireIndex(items, afterId, 'Relative entity');
  items.splice(index + 1, 0, value);
}

function insertQuiz(quizzes: StoredQuiz[], value: StoredQuiz, afterId?: string): void {
  if (!afterId) { quizzes.push(value); return; }
  const index = requireIndex(quizzes, afterId, 'Relative quiz');
  if (quizzes[index].subjectId !== value.subjectId) throw new OperationError(`Relative quiz ${afterId} belongs to another subject.`);
  quizzes.splice(index + 1, 0, value);
}

function insertQuestion(questions: StoredQuestion[], value: StoredQuestion, afterId?: string): void {
  if (afterId) {
    const index = requireIndex(questions, afterId, 'Relative question');
    if (questions[index].quizId !== value.quizId) throw new OperationError(`Relative question ${afterId} belongs to another quiz.`);
    questions.splice(index + 1, 0, value);
    return;
  }
  let lastIndex = -1;
  questions.forEach((question, index) => { if (question.quizId === value.quizId) lastIndex = index; });
  if (lastIndex < 0) questions.push(value);
  else questions.splice(lastIndex + 1, 0, value);
}

function deleteQuiz(bank: StoredQuestionBank, id: string, cascade: boolean | undefined, result: ReturnType<typeof summary>): void {
  const index = requireIndex(bank.quizzes, id, 'Quiz');
  const affectedQuestions = bank.questions.filter(question => question.quizId === id);
  if (affectedQuestions.length && !cascade) throw new OperationError(`Quiz ${id} has ${affectedQuestions.length} question(s); use cascade: true to delete it.`);
  bank.quizzes.splice(index, 1);
  if (affectedQuestions.length) {
    bank.questions = bank.questions.filter(question => question.quizId !== id);
    result.cascadedQuestions += affectedQuestions.length;
  }
  result.deletes += 1;
}

function deleteSubject(bank: StoredQuestionBank, id: string, cascade: boolean | undefined, result: ReturnType<typeof summary>): void {
  const index = requireIndex(bank.subjects, id, 'Subject');
  const affectedQuizzes = bank.quizzes.filter(quiz => quiz.subjectId === id);
  const quizIds = new Set(affectedQuizzes.map(quiz => quiz.id));
  const affectedQuestions = bank.questions.filter(question => quizIds.has(question.quizId));
  if ((affectedQuizzes.length || affectedQuestions.length) && !cascade) throw new OperationError(`Subject ${id} has ${affectedQuizzes.length} quiz(zes); use cascade: true to delete it.`);
  bank.subjects.splice(index, 1);
  if (affectedQuizzes.length) bank.quizzes = bank.quizzes.filter(quiz => quiz.subjectId !== id);
  if (affectedQuestions.length) bank.questions = bank.questions.filter(question => !quizIds.has(question.quizId));
  result.deletes += 1;
  result.cascadedQuizzes += affectedQuizzes.length;
  result.cascadedQuestions += affectedQuestions.length;
}

function applyOperation(bank: StoredQuestionBank, operation: AdminOperation, result: ReturnType<typeof summary>): void {
  switch (operation.op) {
    case 'subject.create':
      requireNew(bank.subjects, operation.value.id, 'Subject'); insertTopLevel(bank.subjects, operation.value, operation.afterId); result.creates += 1; return;
    case 'subject.update': {
      const index = requireIndex(bank.subjects, operation.id, 'Subject');
      if (operation.value.id !== operation.id) throw new OperationError('Subject IDs cannot be changed.');
      bank.subjects[index] = operation.value;
      if (operation.afterId) { const [moved] = bank.subjects.splice(index, 1); insertTopLevel(bank.subjects, moved, operation.afterId); result.moves += 1; }
      result.updates += 1; return;
    }
    case 'subject.delete': deleteSubject(bank, operation.id, operation.cascade, result); return;
    case 'quiz.create':
      requireNew(bank.quizzes, operation.value.id, 'Quiz');
      if (byId(bank.subjects, operation.value.subjectId) < 0) throw new OperationError(`Quiz ${operation.value.id} references an unknown subject.`);
      insertQuiz(bank.quizzes, operation.value, operation.afterId); result.creates += 1; return;
    case 'quiz.update': {
      const index = requireIndex(bank.quizzes, operation.id, 'Quiz');
      if (operation.value.id !== operation.id) throw new OperationError('Quiz IDs cannot be changed.');
      if (byId(bank.subjects, operation.value.subjectId) < 0) throw new OperationError(`Quiz ${operation.id} references an unknown subject.`);
      const moved = bank.quizzes[index].subjectId !== operation.value.subjectId || operation.afterId !== undefined;
      bank.quizzes.splice(index, 1);
      if (moved) insertQuiz(bank.quizzes, operation.value, operation.afterId);
      else bank.quizzes.splice(index, 0, operation.value);
      result.updates += 1; if (moved) result.moves += 1; return;
    }
    case 'quiz.delete': deleteQuiz(bank, operation.id, operation.cascade, result); return;
    case 'question.create':
      requireNew(bank.questions, operation.value.id, 'Question');
      if (byId(bank.quizzes, operation.value.quizId) < 0) throw new OperationError(`Question ${operation.value.id} references an unknown quiz.`);
      insertQuestion(bank.questions, operation.value, operation.afterId); result.creates += 1; return;
    case 'question.update': {
      const index = requireIndex(bank.questions, operation.id, 'Question');
      if (operation.value.id !== operation.id) throw new OperationError('Question IDs cannot be changed.');
      if (byId(bank.quizzes, operation.value.quizId) < 0) throw new OperationError(`Question ${operation.id} references an unknown quiz.`);
      const moved = bank.questions[index].quizId !== operation.value.quizId || operation.afterId !== undefined;
      bank.questions.splice(index, 1);
      if (moved) insertQuestion(bank.questions, operation.value, operation.afterId);
      else bank.questions.splice(index, 0, operation.value);
      result.updates += 1; if (moved) result.moves += 1; return;
    }
    case 'question.delete': {
      const index = requireIndex(bank.questions, operation.id, 'Question');
      bank.questions.splice(index, 1); result.deletes += 1; return;
    }
  }
}

function applyContentAdd(bank: StoredQuestionBank, operation: ContentAddOperation, result: ReturnType<typeof summary>): void {
  const subjectId = 'create' in operation.subject ? operation.subject.create.id : operation.subject.existingId;
  if ('create' in operation.subject) {
    try { applyOperation(bank, { op: 'subject.create', value: operation.subject.create }, result); }
    catch (error) { throw new OperationError(`subject.create: ${error instanceof Error ? error.message : 'Unable to create subject.'}`); }
  } else if (byId(bank.subjects, subjectId) < 0) {
    throw new OperationError(`subject.existingId ${subjectId} does not exist.`);
  }

  operation.quizzes.forEach((quizBlock, quizIndex) => {
    const quizPath = `quizzes[${quizIndex}]`;
    const quizId = 'create' in quizBlock.quiz ? quizBlock.quiz.create.id : quizBlock.quiz.existingId;
    if ('create' in quizBlock.quiz) {
      try {
        applyOperation(bank, {
          op: 'quiz.create',
          value: { ...quizBlock.quiz.create, subjectId },
        }, result);
      } catch (error) {
        throw new OperationError(`${quizPath}.quiz.create: ${error instanceof Error ? error.message : 'Unable to create quiz.'}`);
      }
    } else {
      const existing = bank.quizzes.find(quiz => quiz.id === quizId);
      if (!existing) throw new OperationError(`${quizPath}.quiz.existingId ${quizId} does not exist.`);
      if (existing.subjectId !== subjectId) throw new OperationError(`${quizPath}.quiz.existingId ${quizId} belongs to subject ${existing.subjectId}, not ${subjectId}.`);
    }

    quizBlock.items.forEach((item, itemIndex) => {
      try {
        applyOperation(bank, { op: 'question.create', value: { ...item, quizId } }, result);
      } catch (error) {
        throw new OperationError(`${quizPath}.items[${itemIndex}]: ${error instanceof Error ? error.message : 'Unable to add item.'}`);
      }
    });
  });
}

export function previewChangeSet(bank: StoredQuestionBank, changeSet: AdminChangeSet): AdminChangePreview {
  const next = cloneBank(bank);
  const result = summary();
  const issues: ValidationIssue[] = [];
  changeSet.operations.forEach((operation, index) => {
    try {
      if (operation.op === 'content.add') applyContentAdd(next, operation, result);
      else applyOperation(next, operation, result);
    }
    catch (error) { issues.push({ level: 'error', message: `Operation ${index + 1}: ${error instanceof Error ? error.message : 'Unknown failure'}` }); }
  });
  if (issues.some(issue => issue.level === 'error')) return { bank, issues, summary: result };
  return { bank: next, issues: validateAdminBank(next), summary: result };
}
