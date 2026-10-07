import type { Question, Quiz, QuizRepository, Subject } from '../../domain/types';
import { contentRetryPolicy, type RetryPolicy } from './retryPolicy';
import { isQuestionList, isQuizCatalog, isSubjectCatalog, responseRevision, type QuizCatalogResponse, type SubjectSummary } from './apiDecoders';
import { browserJsonTransport, ContentLoadError, genericFailure, revisionError, type JsonTransport } from './contentTransport';
import { RuntimeContentCache } from './runtimeContentCache';

export { ContentLoadError, getJsonWithRetry } from './contentTransport';
export type { ContentErrorKind } from './contentTransport';
export type { SubjectSummary } from './apiDecoders';
type SubjectCatalogRecord = Subject & Partial<Pick<SubjectSummary, 'quizCount' | 'quizIds'>>;
type ResourceState = 'idle' | 'loading' | 'retrying' | 'ready' | 'error';

export class RuntimeQuestionBank implements QuizRepository {
  private readonly cache = new RuntimeContentCache();
  private readonly pending = new Map<string, Promise<Question[]>>();
  private readonly questionControllers = new Map<string, AbortController>();
  private readonly questionStates = new Map<string, ResourceState>();
  private readonly questionRetryAttempts = new Map<string, number>();
  private revision = '';
  private source: 'api' | 'local' = 'api';
  private summaries: SubjectSummary[] = [];
  private catalogState: ResourceState = 'idle';
  private catalogError?: Error;
  private catalogRetryAt?: number;
  private catalogRetryNow?: AbortController;
  private readonly quizStates = new Map<string, ResourceState>();
  private readonly quizErrors = new Map<string, Error>();
  private readonly quizRecovery = new Set<string>();
  private readonly quizRetryAt = new Map<string, number>();
  private readonly quizRetryAfterAt = new Map<string, number>();
  private readonly quizRetryNow = new Map<string, AbortController>();
  private readonly pendingCatalogs = new Map<string, Promise<Quiz[]>>();
  private listeners = new Set<() => void>();
  private snapshotVersion = 0;
  private generation = 0;

  constructor(
    private readonly retryPolicy: RetryPolicy = contentRetryPolicy,
    private readonly random = Math.random,
    private readonly transport: JsonTransport = browserJsonTransport,
  ) {}

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.snapshotVersion;
  contentRevision = () => this.revision || undefined;
  private notify() { this.snapshotVersion++; this.listeners.forEach(listener => listener()); }
  getCatalogState() { return this.catalogState; }
  getCatalogError() { return this.catalogError; }
  getCatalogRetryAt() { return this.catalogRetryAt; }
  retryCatalogNow() {
    if (this.catalogState !== 'retrying') return false;
    const pendingRetry = this.catalogRetryNow;
    this.catalogRetryNow = new AbortController();
    pendingRetry?.abort();
    return true;
  }
  getQuizState(subjectId: string) { return this.quizStates.get(subjectId) ?? 'idle'; }
  getQuizError(subjectId: string) { return this.quizErrors.get(subjectId); }
  getQuizRecovery(subjectId: string) {
    return {
      failed: this.quizRecovery.has(subjectId),
      retryAt: this.quizRetryAt.get(subjectId),
      retryAfterAt: this.quizRetryAfterAt.get(subjectId),
      retrying: this.quizStates.get(subjectId) === 'retrying',
      busy: this.quizRecovery.has(subjectId) && this.quizStates.get(subjectId) === 'loading',
    };
  }
  retryQuizNow(subjectId: string) {
    if (this.quizStates.get(subjectId) !== 'retrying' || Date.now() < (this.quizRetryAfterAt.get(subjectId) ?? 0)) return false;
    const pendingRetry = this.quizRetryNow.get(subjectId);
    this.quizRetryNow.set(subjectId, new AbortController());
    pendingRetry?.abort();
    return true;
  }
  getQuestionState(quizId: string) { return this.questionStates.get(quizId) ?? (this.cache.hasQuestions(quizId) ? 'ready' : 'idle'); }
  getQuestionRetryAttempt(quizId: string) { return this.questionRetryAttempts.get(quizId) ?? 0; }
  listSubjectSummaries() { return this.summaries; }

  configureApi(subjectResponse: { revision: string; subjects: SubjectCatalogRecord[] }, quizResponses: QuizCatalogResponse[] = []) {
    this.generation++;
    this.cancelQuestionLoads();
    this.source = 'api';
    this.revision = subjectResponse.revision;
    const allQuizzes = quizResponses.flatMap(response => response.quizzes);
    this.summaries = subjectResponse.subjects.map(subject => {
      const quizzes = allQuizzes.filter(quiz => quiz.subjectId === subject.id);
      const quizIds = subject.quizIds ?? quizzes.map(quiz => quiz.id);
      return { ...subject, quizCount: subject.quizCount ?? quizIds.length, quizIds };
    });
    this.cache.replaceCatalog(subjectResponse.subjects, allQuizzes);
    this.catalogState = 'ready';
    this.catalogError = undefined;
    this.catalogRetryAt = undefined;
    this.quizStates.clear(); this.quizErrors.clear(); this.quizRetryAttempts.clear(); this.quizRecovery.clear(); this.quizRetryAt.clear(); this.quizRetryAfterAt.clear(); this.quizRetryNow.clear(); this.pendingCatalogs.clear();
    for (const response of quizResponses) {
      const subjectId = response.quizzes[0]?.subjectId;
      if (subjectId) this.quizStates.set(subjectId, 'ready');
    }
    this.notify();
    this.pending.clear();
    this.questionStates.clear(); this.questionRetryAttempts.clear();
  }

  configureLocal(subjects: Subject[], quizzes: Quiz[], questions: Question[]) {
    this.generation++;
    this.cancelQuestionLoads();
    this.source = 'local';
    this.revision = '';
    this.summaries = subjects.map(subject => {
      const subjectQuizzes = quizzes.filter(quiz => quiz.subjectId === subject.id);
      return { ...subject, quizCount: subjectQuizzes.length, quizIds: subjectQuizzes.map(quiz => quiz.id) };
    });
    this.cache.replaceCatalog(subjects, quizzes, questions);
    this.catalogState = 'ready';
    this.catalogError = undefined;
    this.catalogRetryAt = undefined;
    this.quizStates.clear(); this.quizErrors.clear(); this.quizRetryAttempts.clear(); this.quizRecovery.clear(); this.quizRetryAt.clear(); this.quizRetryAfterAt.clear(); this.quizRetryNow.clear(); this.pendingCatalogs.clear();
    for (const subject of subjects) this.quizStates.set(subject.id, 'ready');
    this.pending.clear();
    this.questionStates.clear(); this.questionRetryAttempts.clear();
    this.notify();
  }

  listSubjects() { return this.cache.listSubjects(); }
  listQuizzes(subjectId: string) { return this.cache.listQuizzes(subjectId); }
  listQuestions(quizId: string) { return this.cache.listQuestions(quizId); }

  async ensureSubjects(): Promise<SubjectSummary[]> {
    if (this.catalogState === 'ready') return this.summaries;
    if (this.source === 'local') return this.summaries;
    if (this.catalogState === 'loading' || this.catalogState === 'retrying') return this.catalogRequest!;
    const generation = this.generation;
    this.catalogState = 'loading'; this.catalogError = undefined; this.catalogRetryAt = undefined;
    this.catalogRetryNow = new AbortController(); this.notify();
    const request = this.transport.get<unknown>('/api/v1/subjects', {
      policy: this.retryPolicy, random: this.random,
      getRetryNowSignal: () => this.catalogRetryNow?.signal,
      onAttempt: () => { if (generation !== this.generation) return; if (this.catalogState === 'retrying') { this.catalogState = 'loading'; this.catalogRetryAt = undefined; this.notify(); } },
      onRetry: (retry, delayMs) => { if (generation !== this.generation) return; this.catalogState = 'retrying'; this.catalogRetryAttempt = retry; this.catalogRetryAt = Date.now() + delayMs; this.notify(); },
    }).then(response => {
      if (generation !== this.generation) throw genericFailure('cancelled');
      if (!isSubjectCatalog(response)) throw new ContentLoadError('invalid', 'The subject catalog is missing quiz membership. Restart or update the backend, then retry.');
      this.revision = response.revision;
      this.cache.setSubjects(response.subjects);
      this.summaries = response.subjects;
      this.catalogState = 'ready'; this.catalogRetryAt = undefined; this.notify();
      return this.summaries;
    }).catch(error => {
      if (generation !== this.generation) throw genericFailure('cancelled');
      if (error instanceof ContentLoadError && error.kind === 'cancelled') throw error;
      this.catalogState = 'error'; this.catalogRetryAt = undefined; this.catalogError = error instanceof Error ? error : new Error('Could not load subjects.');
      this.notify(); throw error;
    }).finally(() => {
      if (this.catalogRequest === request) { this.catalogRequest = undefined; this.catalogRetryNow = undefined; }
    });
    this.catalogRetryAttempt = 0;
    this.catalogRequest = request;
    return request;
  }

  private catalogRequest?: Promise<SubjectSummary[]>;
  private catalogRetryAttempt = 0;
  getCatalogRetryAttempt() { return this.catalogRetryAttempt; }

  async ensureQuizzes(subjectId: string): Promise<Quiz[]> {
    if (this.quizStates.get(subjectId) === 'ready') return this.listQuizzes(subjectId);
    const pending = this.pendingCatalogs.get(subjectId);
    if (pending) return pending;
    if (this.source === 'local') return this.listQuizzes(subjectId);
    const generation = this.generation;
    const request: Promise<Quiz[]> = (async () => {
      try {
        await this.ensureSubjects();
        if (generation !== this.generation) throw genericFailure('cancelled');
        this.quizStates.set(subjectId, 'loading'); this.quizErrors.delete(subjectId); this.quizRetryAttempts.set(subjectId, 0); this.quizRetryAt.delete(subjectId); this.quizRetryAfterAt.delete(subjectId);
        this.quizRetryNow.set(subjectId, new AbortController()); this.notify();
        const response = await this.transport.get<unknown>(`/api/v1/subjects/${encodeURIComponent(subjectId)}/quizzes?revision=${encodeURIComponent(this.revision)}`, {
          policy: this.retryPolicy, random: this.random,
          getRetryNowSignal: () => this.quizRetryNow.get(subjectId)?.signal,
          onAttempt: () => { if (generation !== this.generation) return; if (this.quizRecovery.has(subjectId) && this.quizStates.get(subjectId) === 'retrying') { this.quizStates.set(subjectId, 'loading'); this.quizRetryAt.delete(subjectId); this.notify(); } },
          onRetry: (retry, delayMs, retryAfterMs) => {
            if (generation !== this.generation) return;
            this.quizRecovery.add(subjectId);
            this.quizStates.set(subjectId, 'retrying');
            this.quizRetryAttempts.set(subjectId, retry);
            this.quizRetryAt.set(subjectId, Date.now() + delayMs);
            if (retryAfterMs === undefined) this.quizRetryAfterAt.delete(subjectId);
            else this.quizRetryAfterAt.set(subjectId, Date.now() + retryAfterMs);
            this.notify();
          },
        });
        if (generation !== this.generation) throw genericFailure('cancelled');
        if (responseRevision(response) === undefined) throw new ContentLoadError('invalid', 'The quiz catalog is incomplete. Try again later.');
        if (responseRevision(response) !== this.revision) throw revisionError();
        const expectedQuizIds = this.summaries.find(subject => subject.id === subjectId)?.quizIds;
        if (!expectedQuizIds || !isQuizCatalog(response, subjectId, expectedQuizIds)) throw new ContentLoadError('invalid', 'The quiz catalog is incomplete. Try again later.');
        this.cache.setQuizzes(subjectId, response.quizzes);
        this.quizStates.set(subjectId, 'ready'); this.quizRecovery.delete(subjectId); this.quizRetryAt.delete(subjectId); this.quizRetryAfterAt.delete(subjectId); this.quizRetryNow.delete(subjectId); this.notify();
        return response.quizzes;
      } catch (error) {
        if (generation !== this.generation) throw genericFailure('cancelled');
        if (error instanceof ContentLoadError && error.kind === 'cancelled') throw error;
        this.quizStates.set(subjectId, 'error');
        this.quizRecovery.add(subjectId);
        this.quizRetryAt.delete(subjectId);
        this.quizErrors.set(subjectId, error instanceof Error ? error : new Error('Could not load quizzes.'));
        this.notify(); throw error;
      }
    })();
    this.pendingCatalogs.set(subjectId, request);
    const clearPending = () => { if (this.pendingCatalogs.get(subjectId) === request) this.pendingCatalogs.delete(subjectId); };
    void request.then(clearPending, clearPending);
    return request;
  }
  private readonly quizRetryAttempts = new Map<string, number>();
  getQuizRetryAttempt(subjectId: string) { return this.quizRetryAttempts.get(subjectId) ?? 0; }

  async ensureQuestions(quizId: string): Promise<Question[]> {
    if (this.cache.hasQuestions(quizId)) return this.cache.listQuestions(quizId);
    if (this.source === 'local') return [];
    const pending = this.pending.get(quizId);
    if (pending) return pending;

    const generation = this.generation;
    const controller = new AbortController();
    this.questionControllers.set(quizId, controller);
    this.questionStates.set(quizId, 'loading');
    this.questionRetryAttempts.set(quizId, 0);
    this.notify();
    const request = this.transport.get<unknown>(`/api/v1/quizzes/${encodeURIComponent(quizId)}/questions?revision=${encodeURIComponent(this.revision)}`, {
      signal: controller.signal, policy: this.retryPolicy, random: this.random,
      onRetry: retry => { if (generation !== this.generation) return; this.questionStates.set(quizId, 'retrying'); this.questionRetryAttempts.set(quizId, retry); this.notify(); },
      })
      .then(payload => {
        if (controller.signal.aborted || generation !== this.generation) throw genericFailure('cancelled');
        if (responseRevision(payload) === undefined) throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        if (responseRevision(payload) !== this.revision) throw revisionError();
        const expectedQuestionIds = this.cache.getQuiz(quizId)?.questionIds;
        if (!expectedQuestionIds || !isQuestionList(payload, quizId, expectedQuestionIds)) throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        const questions = payload.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
        this.cache.setQuestions(quizId, questions);
        this.questionStates.set(quizId, 'ready');
        this.notify();
        return questions;
      })
      .catch(error => {
        if (generation !== this.generation) throw genericFailure('cancelled');
        if (!(error instanceof ContentLoadError && error.kind === 'cancelled')) this.questionStates.set(quizId, 'error');
        this.notify();
        throw error;
      })
      .finally(() => {
        if (this.pending.get(quizId) === request) {
          this.pending.delete(quizId);
          this.questionControllers.delete(quizId);
        }
      });
    this.pending.set(quizId, request);
    return request;
  }

  cancelQuestionLoad(quizId: string) {
    this.questionControllers.get(quizId)?.abort();
    this.questionControllers.delete(quizId);
    this.pending.delete(quizId);
    this.questionStates.set(quizId, 'idle');
    this.notify();
  }
  cancelQuestionLoads() {
    [...this.questionControllers.keys()].forEach(quizId => this.cancelQuestionLoad(quizId));
    this.notify();
  }
}

export const runtimeQuestionBank = new RuntimeQuestionBank();

export async function loadRuntimeContent() {
  if (import.meta.env.VITE_CONTENT_SOURCE === 'local') {
    const local = await import('../local/questionBank');
    runtimeQuestionBank.configureLocal(local.subjects, local.quizzes, local.questions);
    return;
  }

  await runtimeQuestionBank.ensureSubjects();
}
