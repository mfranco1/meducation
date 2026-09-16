import type { Question, Quiz, QuizRepository, Subject } from '../domain/types';
import generated from './questionBank.generated.json';
import choiceCorrections from './choiceCorrections.json';

export const subjects = generated.subjects as Subject[];
export const quizzes = generated.quizzes as Quiz[];
const corrections = choiceCorrections as Record<string, Record<string, string>>;
export const questions = (generated.questions as Question[]).map(question => {
  const corrected = corrections[question.id];
  return corrected ? { ...question, choices: question.choices.map(choice => corrected[choice.id] ? { ...choice, text: corrected[choice.id] } : choice) } : question;
});
export const questionBank: QuizRepository = {
  listSubjects: () => subjects,
  listQuizzes: id => quizzes.filter(quiz => quiz.subjectId === id),
  listQuestions: id => questions.filter(question => question.quizId === id),
};
