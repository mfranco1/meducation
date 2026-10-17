import type { Question, Quiz, Subject, Topic } from '../../domain/types';

/** Indexed, revision-scoped content. Request lifecycle stays with RuntimeQuestionBank. */
export class RuntimeContentCache {
  private subjects: Subject[] = [];
  private readonly topicsBySubject = new Map<string, Topic[]>();
  private readonly quizzesBySubject = new Map<string, Quiz[]>();
  private readonly quizzesById = new Map<string, Quiz>();
  private readonly questionsByQuiz = new Map<string, Question[]>();

  replaceCatalog(subjects: Subject[], topics: Topic[] = [], quizzes: Quiz[] = []) {
    this.subjects = subjects;
    this.topicsBySubject.clear();
    for (const topic of topics) this.topicsBySubject.set(topic.subjectId, [...this.listTopics(topic.subjectId), topic]);
    this.quizzesBySubject.clear();
    this.quizzesById.clear();
    this.questionsByQuiz.clear();
    for (const quiz of quizzes) {
      const group = this.quizzesBySubject.get(quiz.subjectId) ?? [];
      group.push(quiz);
      this.quizzesBySubject.set(quiz.subjectId, group);
      this.quizzesById.set(quiz.id, quiz);
    }
  }

  setSubjects(subjects: Subject[]) { this.subjects = subjects; }
  listSubjects() { return this.subjects; }
  listTopics(subjectId: string) { return this.topicsBySubject.get(subjectId) ?? []; }
  listQuizzes(subjectId: string) { return this.quizzesBySubject.get(subjectId) ?? []; }
  getQuiz(quizId: string) { return this.quizzesById.get(quizId); }
  setQuizzes(subjectId: string, topics: Topic[], quizzes: Quiz[]) {
    this.topicsBySubject.set(subjectId, topics);
    for (const old of this.listQuizzes(subjectId)) this.quizzesById.delete(old.id);
    this.quizzesBySubject.set(subjectId, quizzes);
    for (const quiz of quizzes) this.quizzesById.set(quiz.id, quiz);
  }
  hasQuestions(quizId: string) { return this.questionsByQuiz.has(quizId); }
  listQuestions(quizId: string) { return this.questionsByQuiz.get(quizId) ?? []; }
  setQuestions(quizId: string, questions: Question[]) { this.questionsByQuiz.set(quizId, questions); }
}
