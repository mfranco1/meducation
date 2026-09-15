import type { Question, Quiz, QuizRepository, Subject } from '../domain/types';
import generated from './questionBank.generated.json';

export const subjects = generated.subjects as Subject[];
export const quizzes = generated.quizzes as Quiz[];
export const questions = generated.questions as Question[];
export const questionBank: QuizRepository = {
  listSubjects: () => subjects,
  listQuizzes: id => quizzes.filter(quiz => quiz.subjectId === id),
  listQuestions: id => questions.filter(question => question.quizId === id),
};
