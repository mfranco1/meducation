import type { Question, Quiz, QuizRepository, Subject } from '../../domain/types';
import { contentRetryPolicy, type RetryPolicy } from './retryPolicy';
import { isQuestionList, isQuizCatalog, isSubjectCatalog, responseRevision, type QuizCatalogResponse, type SubjectSummary } from './apiDecoders';
import { browserJsonTransport, ContentLoadError, genericFailure, revisionError, type JsonTransport } from './contentTransport';
import { LaunchFreshness } from './launchFreshness';
import { RuntimeContentCache } from './runtimeContentCache';

type SubjectCatalogRecord = Subject & Partial<Pick<SubjectSummary, 'quizCount' | 'quizIds'>>;
type ResourceState = 'idle' | 'loading' | 'retrying' | 'ready' | 'error';

export class RuntimeQuestionBank implements QuizRepository {
  private readonly cache = new RuntimeContentCache();
  private readonly pending = new Map<string, Promise<Question[]>>();
  private readonly questionControllers = new Map<string, AbortController>();
  private revision = '';
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

  private readonly freshness: LaunchFreshness;

  constructor(
    private readonly retryPolicy: RetryPolicy = contentRetryPolicy,
    private readonly random = Math.random,
    private readonly transport: JsonTransport = browserJsonTransport,
    now?: () => number,
  ) { this.freshness = new LaunchFreshness(now); }

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
  listSubjectSummaries() { return this.summaries; }

  configureApi(subjectResponse: { revision: string; subjects: SubjectCatalogRecord[] }, quizResponses: QuizCatalogResponse[] = []) {
    this.generation++;
    this.cancelQuestionLoads();
    this.revision = subjectResponse.revision;
    const allQuizzes = quizResponses.flatMap(response => response.quizzes);
    this.summaries = subjectResponse.subjects.map(subject => {
      const quizzes = allQuizzes.filter(quiz => quiz.subjectId === subject.id);
      const quizIds = subject.quizIds ?? quizzes.map(quiz => quiz.id);
      return { ...subject, quizCount: subject.quizCount ?? quizIds.length, quizIds };
    });
    this.cache.replaceCatalog(subjectResponse.subjects, quizResponses.flatMap(response => response.topics), allQuizzes);
    this.catalogState = 'ready';
    this.catalogError = undefined;
    this.catalogRetryAt = undefined;
    this.quizStates.clear(); this.quizErrors.clear(); this.quizRecovery.clear(); this.quizRetryAt.clear(); this.quizRetryAfterAt.clear(); this.quizRetryNow.clear(); this.pendingCatalogs.clear();
    for (const response of quizResponses) {
      const subjectId = response.topics[0]?.subjectId;
      if (subjectId) this.quizStates.set(subjectId, 'ready');
    }
    this.notify();
    this.pending.clear();
  }

  listSubjects() { return this.cache.listSubjects(); }
  listTopics(subjectId: string) { return this.cache.listTopics(subjectId); }
  listQuizzes(subjectId: string) { return this.cache.listQuizzes(subjectId); }
  listQuestions(quizId: string) { return this.cache.listQuestions(quizId); }

  validateLaunch(quiz: Pick<Quiz, 'id' | 'subjectId'>): Promise<() => void> {
    const revision = this.revision;
    return this.freshness.check(`${quiz.subjectId}:${quiz.id}`, async signal => {
      const payload = await this.transport.get<unknown>('/api/v1/subjects', {
        signal, policy: this.retryPolicy, random: this.random,
      });
      if (!isSubjectCatalog(payload)) throw new ContentLoadError('invalid', 'The subject catalog is incomplete. Retry later.');
      if (payload.revision !== revision) throw revisionError();
      const subject = payload.subjects.find(subject => subject.id === quiz.subjectId);
      if (!subject?.quizIds.includes(quiz.id)) throw revisionError();
    });
  }

  async ensureSubjects(): Promise<SubjectSummary[]> {
    if (this.catalogState === 'ready') return this.summaries;
    if (this.catalogState === 'loading' || this.catalogState === 'retrying') return this.catalogRequest!;
    const generation = this.generation;
    this.catalogState = 'loading'; this.catalogError = undefined; this.catalogRetryAt = undefined;
    this.catalogRetryNow = new AbortController(); this.notify();
    const request = this.transport.get<unknown>('/api/v1/subjects', {
      policy: this.retryPolicy, random: this.random,
      getRetryNowSignal: () => this.catalogRetryNow?.signal,
      onAttempt: () => { if (generation !== this.generation) return; if (this.catalogState === 'retrying') { this.catalogState = 'loading'; this.catalogRetryAt = undefined; this.notify(); } },
      onRetry: (_retry, delayMs) => { if (generation !== this.generation) return; this.catalogState = 'retrying'; this.catalogRetryAt = Date.now() + delayMs; this.notify(); },
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
    this.catalogRequest = request;
    return request;
  }

  private catalogRequest?: Promise<SubjectSummary[]>;

  async ensureQuizzes(subjectId: string): Promise<Quiz[]> {
    if (this.quizStates.get(subjectId) === 'ready') return this.listQuizzes(subjectId);
    const pending = this.pendingCatalogs.get(subjectId);
    if (pending) return pending;
    const generation = this.generation;
    const request: Promise<Quiz[]> = (async () => {
      try {
        await this.ensureSubjects();
        if (generation !== this.generation) throw genericFailure('cancelled');
        this.quizStates.set(subjectId, 'loading'); this.quizErrors.delete(subjectId); this.quizRetryAt.delete(subjectId); this.quizRetryAfterAt.delete(subjectId);
        this.quizRetryNow.set(subjectId, new AbortController()); this.notify();
        const response = await this.transport.get<unknown>(`/api/v1/subjects/${encodeURIComponent(subjectId)}/quizzes?revision=${encodeURIComponent(this.revision)}`, {
          policy: this.retryPolicy, random: this.random,
          getRetryNowSignal: () => this.quizRetryNow.get(subjectId)?.signal,
          onAttempt: () => { if (generation !== this.generation) return; if (this.quizRecovery.has(subjectId) && this.quizStates.get(subjectId) === 'retrying') { this.quizStates.set(subjectId, 'loading'); this.quizRetryAt.delete(subjectId); this.notify(); } },
          onRetry: (_retry, delayMs, retryAfterMs) => {
            if (generation !== this.generation) return;
            this.quizRecovery.add(subjectId);
            this.quizStates.set(subjectId, 'retrying');
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
        this.cache.setQuizzes(subjectId, response.topics, response.quizzes);
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

  async ensureQuestions(quizId: string): Promise<Question[]> {
    if (this.cache.hasQuestions(quizId)) return this.cache.listQuestions(quizId);
    const pending = this.pending.get(quizId);
    if (pending) return pending;

    const generation = this.generation;
    const controller = new AbortController();
    this.questionControllers.set(quizId, controller);
    const request = this.transport.get<unknown>(`/api/v1/quizzes/${encodeURIComponent(quizId)}/questions?revision=${encodeURIComponent(this.revision)}`, {
      signal: controller.signal, policy: this.retryPolicy, random: this.random,
      })
      .then(payload => {
        if (controller.signal.aborted || generation !== this.generation) throw genericFailure('cancelled');
        if (responseRevision(payload) === undefined) throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        if (responseRevision(payload) !== this.revision) throw revisionError();
        const expectedQuestionIds = this.cache.getQuiz(quizId)?.questionIds;
        if (!expectedQuestionIds || !isQuestionList(payload, quizId, expectedQuestionIds)) throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        const questions = payload.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
        this.cache.setQuestions(quizId, questions);
        this.notify();
        return questions;
      })
      .catch(error => {
        if (generation !== this.generation) throw genericFailure('cancelled');
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
  }
  cancelQuestionLoads() {
    this.freshness.cancelAll();
    [...this.questionControllers.keys()].forEach(quizId => this.cancelQuestionLoad(quizId));
  }
}

export const runtimeQuestionBank = new RuntimeQuestionBank();

export async function loadRuntimeContent() {
  await runtimeQuestionBank.ensureSubjects();
}
