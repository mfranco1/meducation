import type { Question, Quiz, QuizRepository, Subject } from '../domain/types';

interface SubjectResponse { revision: string; subjects: Subject[] }
interface QuizResponse { revision: string; quizzes: Quiz[] }
interface QuestionResponse { revision: string; questions: Question[] }

class RuntimeQuestionBank implements QuizRepository {
  private subjects: Subject[] = [];
  private quizzes: Quiz[] = [];
  private readonly questionsByQuiz = new Map<string, Question[]>();
  private readonly pending = new Map<string, Promise<Question[]>>();
  private revision = '';
  private source: 'api' | 'local' = 'api';

  configureApi(subjectResponse: SubjectResponse, quizResponses: QuizResponse[]) {
    this.source = 'api';
    this.revision = subjectResponse.revision;
    this.subjects = subjectResponse.subjects;
    this.quizzes = quizResponses.flatMap(response => response.quizzes);
    this.questionsByQuiz.clear();
    this.pending.clear();
  }

  configureLocal(subjects: Subject[], quizzes: Quiz[], questions: Question[]) {
    this.source = 'local';
    this.subjects = subjects;
    this.quizzes = quizzes;
    this.questionsByQuiz.clear();
    for (const question of questions) {
      const current = this.questionsByQuiz.get(question.quizId) ?? [];
      current.push(question);
      this.questionsByQuiz.set(question.quizId, current);
    }
    this.pending.clear();
  }

  listSubjects() { return this.subjects; }
  listQuizzes(subjectId: string) { return this.quizzes.filter(quiz => quiz.subjectId === subjectId); }
  listQuestions(quizId: string) { return this.questionsByQuiz.get(quizId) ?? []; }

  async ensureQuestions(quizId: string): Promise<Question[]> {
    const cached = this.questionsByQuiz.get(quizId);
    if (cached) return cached;
    if (this.source === 'local') return [];
    const pending = this.pending.get(quizId);
    if (pending) return pending;

    const request = fetch(`/api/v1/quizzes/${encodeURIComponent(quizId)}/questions?revision=${encodeURIComponent(this.revision)}`, {
      signal: AbortSignal.timeout(15000),
    })
      .then(async response => {
        if (response.status === 409) throw new Error('Quiz content changed on the server. Reload the app to get the latest content.');
        if (!response.ok) throw new Error(`Could not load quiz questions (${response.status}).`);
        const payload = await response.json() as QuestionResponse;
        if (payload.revision !== this.revision) throw new Error('Quiz content changed on the server. Reload the app to get the latest content.');
        const questions = payload.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
        this.questionsByQuiz.set(quizId, questions);
        return questions;
      })
      .finally(() => this.pending.delete(quizId));
    this.pending.set(quizId, request);
    return request;
  }
}

export const runtimeQuestionBank = new RuntimeQuestionBank();

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Could not load quiz catalog (${response.status}).`);
  return response.json() as Promise<T>;
}

export async function loadRuntimeContent() {
  if (import.meta.env.VITE_CONTENT_SOURCE === 'local') {
    const local = await import('./questionBank');
    runtimeQuestionBank.configureLocal(local.subjects, local.quizzes, local.questions);
    return;
  }

  const catalog = await getJson<SubjectResponse>('/api/v1/subjects');
  const quizResponses = await Promise.all(catalog.subjects.map(subject =>
    getJson<QuizResponse>(`/api/v1/subjects/${encodeURIComponent(subject.id)}/quizzes`),
  ));
  if (quizResponses.some(response => response.revision !== catalog.revision)) {
    throw new Error('Quiz content changed while loading. Retry to load a consistent catalog.');
  }
  runtimeQuestionBank.configureApi(catalog, quizResponses);
}
