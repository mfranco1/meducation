import type { Question, Quiz, QuizRepository, Subject } from '../domain/types';
import generated from './questionBank.generated.json';
import type { StoredQuestionBank } from './schema';

const bank = generated as unknown as StoredQuestionBank;
export const storedQuestionBank = bank;
export const schemaVersion = bank.schemaVersion;
export const subjects = bank.subjects;
export const questions: Question[] = bank.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
const questionsByQuizId = new Map<string, Question[]>();
const quizzesBySubjectId = new Map<string, Quiz[]>();

for (const question of questions) {
  const quizQuestions = questionsByQuizId.get(question.quizId) ?? [];
  quizQuestions.push(question);
  questionsByQuizId.set(question.quizId, quizQuestions);
}

export const quizzes: Quiz[] = bank.quizzes.map(quiz => ({
  ...quiz,
  questionCount: questionsByQuizId.get(quiz.id)?.length ?? 0,
}));
for (const quiz of quizzes) {
  const subjectQuizzes = quizzesBySubjectId.get(quiz.subjectId) ?? [];
  subjectQuizzes.push(quiz);
  quizzesBySubjectId.set(quiz.subjectId, subjectQuizzes);
}

export const questionBank: QuizRepository = {
  listSubjects: () => subjects,
  listQuizzes: id => quizzesBySubjectId.get(id) ?? [],
  listQuestions: id => questionsByQuizId.get(id) ?? [],
};
