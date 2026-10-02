import type { Question, Quiz, QuizRepository, Subject } from '../domain/types';
import { contentRetryPolicy, isRetryableStatus, retryAfterMs, retryDelayMs, type RetryPolicy } from './retryPolicy';
import { logContentDiagnostic } from './contentLogger';
import { isQuestionList, isQuizCatalog, isSubjectCatalog, responseRevision, type QuizCatalogResponse, type SubjectSummary } from './apiDecoders';

export type { SubjectSummary } from './apiDecoders';
type SubjectCatalogRecord = Subject & Partial<Pick<SubjectSummary, 'quizCount' | 'quizIds'>>;
type ResourceState = 'idle' | 'loading' | 'retrying' | 'ready' | 'error';
export type ContentErrorKind = 'timeout' | 'network' | 'http' | 'invalid' | 'revision' | 'cancelled';

export class ContentLoadError extends Error {
  constructor(readonly kind: ContentErrorKind, message: string, readonly status?: number, readonly retryAfter?: string | null) { super(message); this.name = 'ContentLoadError'; }
}

const revisionError = () => new ContentLoadError('revision', 'Quiz content changed. Reload content to get the latest version.');
const timeoutMs = 15_000;

const genericFailure = (kind: ContentErrorKind, status?: number, retryAfter?: string | null) =>
  new ContentLoadError(kind, 'The content request could not be completed.', status, retryAfter);

function waitForRetry(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(genericFailure('cancelled'));
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delayMs);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(genericFailure('cancelled')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function getJsonWithRetry<T>(
  path: string,
  options: {
    signal?: AbortSignal;
    policy?: RetryPolicy;
    random?: () => number;
    onRetry?: (retryNumber: number, delayMs: number) => void;
  } = {},
): Promise<T> {
  const policy = options.policy ?? contentRetryPolicy;
  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) throw genericFailure('cancelled');
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let parentAborted = false;
    let timedOut = false;
    const abortFromParent = () => { parentAborted = true; controller.abort(); };
    let rejectParentAbort: ((reason?: unknown) => void) | undefined;
    const abort = new Promise<never>((_, reject) => { rejectParentAbort = reject; });
    const notifyParentAbort = () => { abortFromParent(); rejectParentAbort?.(genericFailure('cancelled')); };
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
    options.signal?.addEventListener('abort', notifyParentAbort, { once: true });
    if (options.signal?.aborted) notifyParentAbort();
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(genericFailure('timeout'));
      }, timeoutMs);
    });
    let failure: ContentLoadError | undefined;
    try {
      const request = fetch(path, { headers: { Accept: 'application/json' }, signal: controller.signal }).then(async response => {
        if (response.status === 409) throw revisionError();
        if (!response.ok) throw genericFailure('http', response.status, response.headers.get('Retry-After'));
        try { return await response.json() as T; }
        catch { throw genericFailure('invalid'); }
      });
      const result = await Promise.race([request, timeout, abort]);
      if (options.signal?.aborted) throw genericFailure('cancelled');
      return result;
    } catch (error) {
      if (parentAborted || options.signal?.aborted) throw genericFailure('cancelled');
      failure = error instanceof ContentLoadError
        ? error
        : timedOut ? genericFailure('timeout') : genericFailure('network');
      const retryable = failure.kind === 'timeout' || failure.kind === 'network'
        || (failure.kind === 'http' && failure.status !== undefined && isRetryableStatus(failure.status));
      const retryNumber = attempt + 1;
      const serverDelay = failure.status === 429 || failure.status === 503
        ? retryAfterMs(failure.retryAfter ?? null)
        : undefined;
      const exhausted = attempt >= policy.maxRetries;
      const serverDelayTooLong = serverDelay !== undefined && serverDelay > policy.maxDelayMs;
      const delay = retryable && !exhausted && !serverDelayTooLong
        ? Math.max(retryDelayMs(retryNumber, policy, options.random), serverDelay ?? 0)
        : undefined;
      logContentDiagnostic('Request attempt failed.', {
        resource: path.split('?')[0],
        category: failure.kind,
        ...(failure.status === undefined ? {} : { status: failure.status }),
        attempt: retryNumber,
        retrying: delay !== undefined,
        retryBudgetExhausted: exhausted,
        retryAfterLimitExceeded: serverDelayTooLong,
        ...(delay === undefined ? {} : { nextDelayMs: delay }),
      });
      if (delay === undefined) throw failure;
      options.onRetry?.(retryNumber, delay);
      if (timeoutId !== undefined) { clearTimeout(timeoutId); timeoutId = undefined; }
      await waitForRetry(delay, options.signal);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortFromParent);
      options.signal?.removeEventListener('abort', notifyParentAbort);
    }
  }
}

export class RuntimeQuestionBank implements QuizRepository {
  private subjects: Subject[] = [];
  private quizzes: Quiz[] = [];
  private readonly questionsByQuiz = new Map<string, Question[]>();
  private readonly pending = new Map<string, Promise<Question[]>>();
  private readonly questionControllers = new Map<string, AbortController>();
  private readonly questionStates = new Map<string, ResourceState>();
  private readonly questionRetryAttempts = new Map<string, number>();
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

  constructor(private readonly retryPolicy: RetryPolicy = contentRetryPolicy, private readonly random = Math.random) {}

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.snapshotVersion;
  private notify() { this.snapshotVersion++; this.listeners.forEach(listener => listener()); }
  getCatalogState() { return this.catalogState; }
  getCatalogError() { return this.catalogError; }
  getQuizState(subjectId: string) { return this.quizStates.get(subjectId) ?? 'idle'; }
  getQuizError(subjectId: string) { return this.quizErrors.get(subjectId); }
  getQuestionState(quizId: string) { return this.questionStates.get(quizId) ?? (this.questionsByQuiz.has(quizId) ? 'ready' : 'idle'); }
  getQuestionRetryAttempt(quizId: string) { return this.questionRetryAttempts.get(quizId) ?? 0; }
  listSubjectSummaries() { return this.summaries; }

  configureApi(subjectResponse: { revision: string; subjects: SubjectCatalogRecord[] }, quizResponses: QuizCatalogResponse[] = []) {
    this.cancelQuestionLoads();
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
    this.catalogError = undefined;
    this.quizStates.clear(); this.quizErrors.clear(); this.quizRetryAttempts.clear(); this.pendingCatalogs.clear();
    for (const response of quizResponses) {
      const subjectId = response.quizzes[0]?.subjectId;
      if (subjectId) this.quizStates.set(subjectId, 'ready');
    }
    this.notify();
    this.questionsByQuiz.clear();
    this.pending.clear();
    this.questionStates.clear(); this.questionRetryAttempts.clear();
  }

  configureLocal(subjects: Subject[], quizzes: Quiz[], questions: Question[]) {
    this.cancelQuestionLoads();
    this.source = 'local';
    this.subjects = subjects;
    this.summaries = subjects.map(subject => {
      const subjectQuizzes = quizzes.filter(quiz => quiz.subjectId === subject.id);
      return { ...subject, quizCount: subjectQuizzes.length, quizIds: subjectQuizzes.map(quiz => quiz.id) };
    });
    this.quizzes = quizzes;
    this.catalogState = 'ready';
    this.catalogError = undefined;
    this.quizStates.clear(); this.quizErrors.clear(); this.quizRetryAttempts.clear(); this.pendingCatalogs.clear();
    for (const subject of subjects) this.quizStates.set(subject.id, 'ready');
    this.questionsByQuiz.clear();
    for (const question of questions) {
      const current = this.questionsByQuiz.get(question.quizId) ?? [];
      current.push(question);
      this.questionsByQuiz.set(question.quizId, current);
    }
    this.pending.clear();
    this.questionStates.clear(); this.questionRetryAttempts.clear();
    this.notify();
  }

  listSubjects() { return this.subjects; }
  listQuizzes(subjectId: string) { return this.quizzes.filter(quiz => quiz.subjectId === subjectId); }
  listQuestions(quizId: string) { return this.questionsByQuiz.get(quizId) ?? []; }

  async ensureSubjects(): Promise<SubjectSummary[]> {
    if (this.catalogState === 'ready') return this.summaries;
    if (this.source === 'local') return this.summaries;
    if (this.catalogState === 'loading' || this.catalogState === 'retrying') return this.catalogRequest!;
    this.catalogState = 'loading'; this.catalogError = undefined; this.notify();
    const request = getJsonWithRetry<unknown>('/api/v1/subjects', {
      policy: this.retryPolicy, random: this.random,
      onRetry: retry => { this.catalogState = 'retrying'; this.catalogRetryAttempt = retry; this.notify(); },
    }).then(response => {
      if (!isSubjectCatalog(response)) throw new ContentLoadError('invalid', 'The subject catalog is missing quiz membership. Restart or update the backend, then retry.');
      this.revision = response.revision;
      this.subjects = response.subjects;
      this.summaries = response.subjects;
      this.catalogState = 'ready'; this.notify();
      return this.summaries;
    }).catch(error => {
      if (error instanceof ContentLoadError && error.kind === 'cancelled') throw error;
      this.catalogState = 'error'; this.catalogError = error instanceof Error ? error : new Error('Could not load subjects.');
      this.notify(); throw error;
    }).finally(() => {
      if (this.catalogRequest === request) this.catalogRequest = undefined;
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
    let request!: Promise<Quiz[]>;
    request = (async () => {
      try {
        await this.ensureSubjects();
        this.quizStates.set(subjectId, 'loading'); this.quizErrors.delete(subjectId); this.quizRetryAttempts.set(subjectId, 0); this.notify();
        const response = await getJsonWithRetry<unknown>(`/api/v1/subjects/${encodeURIComponent(subjectId)}/quizzes?revision=${encodeURIComponent(this.revision)}`, {
          policy: this.retryPolicy, random: this.random,
          onRetry: retry => { this.quizStates.set(subjectId, 'retrying'); this.quizRetryAttempts.set(subjectId, retry); this.notify(); },
        });
        if (responseRevision(response) === undefined) throw new ContentLoadError('invalid', 'The quiz catalog is incomplete. Try again later.');
        if (responseRevision(response) !== this.revision) throw revisionError();
        const expectedQuizIds = this.summaries.find(subject => subject.id === subjectId)?.quizIds;
        if (!expectedQuizIds || !isQuizCatalog(response, subjectId, expectedQuizIds)) throw new ContentLoadError('invalid', 'The quiz catalog is incomplete. Try again later.');
        this.quizzes = [...this.quizzes.filter(quiz => quiz.subjectId !== subjectId), ...response.quizzes];
        this.quizStates.set(subjectId, 'ready'); this.notify();
        return response.quizzes;
      } catch (error) {
        if (error instanceof ContentLoadError && error.kind === 'cancelled') throw error;
        this.quizStates.set(subjectId, 'error');
        this.quizErrors.set(subjectId, error instanceof Error ? error : new Error('Could not load quizzes.'));
        this.notify(); throw error;
      } finally { if (this.pendingCatalogs.get(subjectId) === request) this.pendingCatalogs.delete(subjectId); }
    })();
    this.pendingCatalogs.set(subjectId, request);
    return request;
  }
  private readonly quizRetryAttempts = new Map<string, number>();
  getQuizRetryAttempt(subjectId: string) { return this.quizRetryAttempts.get(subjectId) ?? 0; }

  async ensureQuestions(quizId: string): Promise<Question[]> {
    const cached = this.questionsByQuiz.get(quizId);
    if (cached) return cached;
    if (this.source === 'local') return [];
    const pending = this.pending.get(quizId);
    if (pending) return pending;

    const controller = new AbortController();
    this.questionControllers.set(quizId, controller);
    this.questionStates.set(quizId, 'loading');
    this.questionRetryAttempts.set(quizId, 0);
    this.notify();
    const request = getJsonWithRetry<unknown>(`/api/v1/quizzes/${encodeURIComponent(quizId)}/questions?revision=${encodeURIComponent(this.revision)}`, {
      signal: controller.signal, policy: this.retryPolicy, random: this.random,
      onRetry: retry => { this.questionStates.set(quizId, 'retrying'); this.questionRetryAttempts.set(quizId, retry); this.notify(); },
      })
      .then(payload => {
        if (controller.signal.aborted) throw genericFailure('cancelled');
        if (responseRevision(payload) === undefined) throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        if (responseRevision(payload) !== this.revision) throw revisionError();
        const expectedQuestionIds = this.quizzes.find(quiz => quiz.id === quizId)?.questionIds;
        if (!expectedQuestionIds || !isQuestionList(payload, quizId, expectedQuestionIds)) throw new ContentLoadError('invalid', 'The questions are incomplete. Try again later.');
        const questions = payload.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
        this.questionsByQuiz.set(quizId, questions);
        this.questionStates.set(quizId, 'ready');
        this.notify();
        return questions;
      })
      .catch(error => {
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
    const local = await import('./questionBank');
    runtimeQuestionBank.configureLocal(local.subjects, local.quizzes, local.questions);
    return;
  }

  await runtimeQuestionBank.ensureSubjects();
}
