import type { Question, Quiz, Subject } from '../domain/types';

/** Indexed, revision-scoped content. Request lifecycle stays with RuntimeQuestionBank. */
export class RuntimeContentCache {
  private subjects: Subject[] = [];
  private readonly quizzesBySubject = new Map<string, Quiz[]>();
  private readonly quizzesById = new Map<string, Quiz>();
  private readonly questionsByQuiz = new Map<string, Question[]>();

  replaceCatalog(subjects: Subject[], quizzes: Quiz[] = [], questions: Question[] = []) {
    this.subjects = subjects;
    this.quizzesBySubject.clear();
    this.quizzesById.clear();
    this.questionsByQuiz.clear();
    for (const quiz of quizzes) {
      const group = this.quizzesBySubject.get(quiz.subjectId) ?? [];
      group.push(quiz);
      this.quizzesBySubject.set(quiz.subjectId, group);
      this.quizzesById.set(quiz.id, quiz);
    }
    for (const question of questions) {
      const group = this.questionsByQuiz.get(question.quizId) ?? [];
      group.push(question);
      this.questionsByQuiz.set(question.quizId, group);
    }
  }

  setSubjects(subjects: Subject[]) { this.subjects = subjects; }
  listSubjects() { return this.subjects; }
  listQuizzes(subjectId: string) { return this.quizzesBySubject.get(subjectId) ?? []; }
  getQuiz(quizId: string) { return this.quizzesById.get(quizId); }
  setQuizzes(subjectId: string, quizzes: Quiz[]) {
    for (const old of this.listQuizzes(subjectId)) this.quizzesById.delete(old.id);
    this.quizzesBySubject.set(subjectId, quizzes);
    for (const quiz of quizzes) this.quizzesById.set(quiz.id, quiz);
  }
  hasQuestions(quizId: string) { return this.questionsByQuiz.has(quizId); }
  listQuestions(quizId: string) { return this.questionsByQuiz.get(quizId) ?? []; }
  setQuestions(quizId: string, questions: Question[]) { this.questionsByQuiz.set(quizId, questions); }
}
