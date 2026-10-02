import type { Question, Quiz, QuizRepository, Subject } from '../domain/types';

interface QuizResponse { revision: string; quizzes: Quiz[] }
interface QuestionResponse { revision: string; questions: Question[] }
export interface SubjectSummary extends Subject { quizCount: number; quizIds: string[] }
type SubjectCatalogRecord = Subject & Partial<Pick<SubjectSummary, 'quizCount' | 'quizIds'>>;
type ResourceState = 'idle' | 'loading' | 'ready' | 'error';
export type ContentErrorKind = 'timeout' | 'network' | 'http' | 'invalid' | 'revision';

export class ContentLoadError extends Error {
  constructor(readonly kind: ContentErrorKind, message: string) { super(message); this.name = 'ContentLoadError'; }
}

const revisionError = () => new ContentLoadError('revision', 'Quiz content changed. Reload content to get the latest version.');
const timeoutMs = 15_000;

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => { controller.abort(); reject(new ContentLoadError('timeout', 'The request took too long. Try again or come back later.')); }, timeoutMs);
  });
  try {
    return await Promise.race([fetch(path, { headers: { Accept: 'application/json' }, signal: controller.signal }).then(async response => {
      if (response.status === 409) throw revisionError();
      if (!response.ok) throw new ContentLoadError('http', `The content service returned ${response.status}. Try again or come back later.`);
      try { return await response.json() as T; }
      catch { throw new ContentLoadError('invalid', 'The content service returned an unreadable response. Try again later.'); }
    }), timeout]);
  } catch (error) {
    if (error instanceof ContentLoadError) throw error;
    throw new ContentLoadError('network', 'Could not reach the content service. Check your connection and try again.');
  } finally { if (timeoutId !== undefined) clearTimeout(timeoutId); }
}

function validSubjectCatalog(value: unknown): value is { revision: string; subjects: SubjectSummary[] } {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Record<string, unknown>;
  return typeof catalog.revision === 'string' && Array.isArray(catalog.subjects) && catalog.subjects.every(subject => {
    if (!subject || typeof subject !== 'object') return false;
    const item = subject as Record<string, unknown>;
    return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.accent === 'string'
      && Number.isInteger(item.quizCount) && (item.quizCount as number) >= 0
      && Array.isArray(item.quizIds) && item.quizIds.length === item.quizCount
      && item.quizIds.every((id: unknown) => typeof id === 'string');
  });
}

function validQuizCatalog(value: unknown, revision: string, subjectId: string): value is QuizResponse {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Record<string, unknown>;
  return catalog.revision === revision && Array.isArray(catalog.quizzes) && catalog.quizzes.every(quiz => {
    if (!quiz || typeof quiz !== 'object') return false;
    const item = quiz as Record<string, unknown>;
    return typeof item.id === 'string' && item.subjectId === subjectId && typeof item.name === 'string'
      && Number.isInteger(item.questionCount) && (item.questionCount as number) > 0
      && Array.isArray(item.questionIds) && item.questionIds.length === item.questionCount
      && item.questionIds.every((id: unknown) => typeof id === 'string');
  });
}

export class RuntimeQuestionBank implements QuizRepository {
  private subjects: Subject[] = [];
  private quizzes: Quiz[] = [];
  private readonly questionsByQuiz = new Map<string, Question[]>();
  private readonly pending = new Map<string, Promise<Question[]>>();
  private revision = '';
  private source: 'api' | 'local' = 'api';
  private summaries: SubjectSummary[] = [];
  private catalogState: ResourceState = 'idle';
  private catalogError?: Error;
  private readonly quizStates = new Map<string, ResourceState>();
  private readonly quizErrors = new Map<string, Error>();
  private readonly pendingCatalogs = new Map<string, Promise<Quiz[]>>();
  private listeners = new Set<() => void>();
  private snapshotVersion = 0;

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.snapshotVersion;
  private notify() { this.snapshotVersion++; this.listeners.forEach(listener => listener()); }
  getCatalogState() { return this.catalogState; }
  getCatalogError() { return this.catalogError; }
  getQuizState(subjectId: string) { return this.quizStates.get(subjectId) ?? 'idle'; }
  getQuizError(subjectId: string) { return this.quizErrors.get(subjectId); }
  listSubjectSummaries() { return this.summaries; }

  configureApi(subjectResponse: { revision: string; subjects: SubjectCatalogRecord[] }, quizResponses: QuizResponse[] = []) {
    this.source = 'api';
    this.revision = subjectResponse.revision;
    this.subjects = subjectResponse.subjects;
    this.summaries = subjectResponse.subjects.map(subject => {
      const quizzes = quizResponses.flatMap(response => response.quizzes).filter(quiz => quiz.subjectId === subject.id);
      const quizIds = subject.quizIds ?? quizzes.map(quiz => quiz.id);
      return { ...subject, quizCount: subject.quizCount ?? quizIds.length, quizIds };
    });
    this.quizzes = quizResponses.flatMap(response => response.quizzes);
    this.catalogState = 'ready';
    this.quizStates.clear(); this.quizErrors.clear(); this.pendingCatalogs.clear();
    for (const response of quizResponses) {
      const subjectId = response.quizzes[0]?.subjectId;
      if (subjectId) this.quizStates.set(subjectId, 'ready');
    }
    this.notify();
    this.questionsByQuiz.clear();
    this.pending.clear();
  }

  configureLocal(subjects: Subject[], quizzes: Quiz[], questions: Question[]) {
    this.source = 'local';
    this.subjects = subjects;
    this.summaries = subjects.map(subject => {
      const subjectQuizzes = quizzes.filter(quiz => quiz.subjectId === subject.id);
      return { ...subject, quizCount: subjectQuizzes.length, quizIds: subjectQuizzes.map(quiz => quiz.id) };
    });
    this.quizzes = quizzes;
    this.catalogState = 'ready';
    this.quizStates.clear(); this.quizErrors.clear(); this.pendingCatalogs.clear();
    for (const subject of subjects) this.quizStates.set(subject.id, 'ready');
    this.questionsByQuiz.clear();
    for (const question of questions) {
      const current = this.questionsByQuiz.get(question.quizId) ?? [];
      current.push(question);
      this.questionsByQuiz.set(question.quizId, current);
    }
    this.pending.clear();
    this.notify();
  }

  listSubjects() { return this.subjects; }
  listQuizzes(subjectId: string) { return this.quizzes.filter(quiz => quiz.subjectId === subjectId); }
  listQuestions(quizId: string) { return this.questionsByQuiz.get(quizId) ?? []; }

  async ensureSubjects(): Promise<SubjectSummary[]> {
    if (this.catalogState === 'ready') return this.summaries;
    if (this.source === 'local') return this.summaries;
    if (this.catalogState === 'loading') return this.catalogRequest!;
    this.catalogState = 'loading'; this.catalogError = undefined; this.notify();
    this.catalogRequest = getJson<unknown>('/api/v1/subjects').then(response => {
      if (!validSubjectCatalog(response)) throw new ContentLoadError('invalid', 'The subject catalog is missing quiz membership. Restart or update the backend, then retry.');
      this.revision = response.revision;
      this.subjects = response.subjects;
      this.summaries = response.subjects;
      this.catalogState = 'ready'; this.notify();
      return this.summaries;
    }).catch(error => {
      this.catalogState = 'error'; this.catalogError = error instanceof Error ? error : new Error('Could not load subjects.');
      this.notify(); throw error;
    });
    return this.catalogRequest;
  }

  private catalogRequest?: Promise<SubjectSummary[]>;

  async ensureQuizzes(subjectId: string): Promise<Quiz[]> {
    if (this.quizStates.get(subjectId) === 'ready') return this.listQuizzes(subjectId);
    const pending = this.pendingCatalogs.get(subjectId);
    if (pending) return pending;
    if (this.source === 'local') return this.listQuizzes(subjectId);
    const request = (async () => {
      try {
        await this.ensureSubjects();
        this.quizStates.set(subjectId, 'loading'); this.quizErrors.delete(subjectId); this.notify();
        const response = await getJson<unknown>(`/api/v1/subjects/${encodeURIComponent(subjectId)}/quizzes?revision=${encodeURIComponent(this.revision)}`);
        if (!response || typeof response !== 'object' || typeof (response as QuizResponse).revision !== 'string') throw new ContentLoadError('invalid', 'The quiz catalog is incomplete. Try again later.');
        if ((response as QuizResponse).revision !== this.revision) throw revisionError();
        if (!validQuizCatalog(response, this.revision, subjectId)) throw new ContentLoadError('invalid', 'The quiz catalog is incomplete. Try again later.');
        this.quizzes = [...this.quizzes.filter(quiz => quiz.subjectId !== subjectId), ...response.quizzes];
        this.quizStates.set(subjectId, 'ready'); this.notify();
        return response.quizzes;
      } catch (error) {
        this.quizStates.set(subjectId, 'error');
        this.quizErrors.set(subjectId, error instanceof Error ? error : new Error('Could not load quizzes.'));
        this.notify(); throw error;
      } finally { this.pendingCatalogs.delete(subjectId); }
    })();
    this.pendingCatalogs.set(subjectId, request);
    return request;
  }

  async ensureQuestions(quizId: string): Promise<Question[]> {
    const cached = this.questionsByQuiz.get(quizId);
    if (cached) return cached;
    if (this.source === 'local') return [];
    const pending = this.pending.get(quizId);
    if (pending) return pending;

    const request = getJson<unknown>(`/api/v1/quizzes/${encodeURIComponent(quizId)}/questions?revision=${encodeURIComponent(this.revision)}`)
      .then(payload => {
        if (!payload || typeof payload !== 'object' || typeof (payload as QuestionResponse).revision !== 'string') throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        if ((payload as QuestionResponse).revision !== this.revision) throw revisionError();
        if (!payload || typeof payload !== 'object' || !Array.isArray((payload as QuestionResponse).questions) || (payload as QuestionResponse).questions.length === 0) throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        const questionsPayload = (payload as QuestionResponse).questions;
        if (questionsPayload.some(question => !question || typeof question.id !== 'string' || question.quizId !== quizId || !Array.isArray(question.choices))) throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        const questions = questionsPayload.map(question => ({ ...question, metadata: question.metadata ?? {} }));
        this.questionsByQuiz.set(quizId, questions);
        return questions;
      })
      .finally(() => this.pending.delete(quizId));
    this.pending.set(quizId, request);
    return request;
  }
}

export const runtimeQuestionBank = new RuntimeQuestionBank();

export async function loadRuntimeContent() {
  if (import.meta.env.VITE_CONTENT_SOURCE === 'local') {
    const local = await import('./questionBank');
    runtimeQuestionBank.configureLocal(local.subjects, local.quizzes, local.questions);
    return;
  }

  await runtimeQuestionBank.ensureSubjects();
}
