import type { StoredQuestionBank, StoredFlashcardBank } from '../../content/schema/schema';

export interface SessionStatus {
  authenticated: boolean;
  csrfToken: string;
  expiresAt?: number;
  fresh?: boolean;
}
export interface PairedSnapshot {
  contractVersion: 1;
  pair: { quizzes: StoredQuestionBank; flashcards: StoredFlashcardBank };
  draft: {
    revision: string;
    baseReleaseId: string | null;
    basePublicationSequence: string;
    digests: { quizSha256: string; flashcardSha256: string; quizRevision: string; flashcardRevision: string };
  };
  publication: {
    releaseId: string | null;
    sequence: string;
    digests: { quizRevision: string; flashcardRevision: string } | null;
  };
  undo: { available: boolean; targetRevision: string | null; depth: number };
}
export interface Slot {
  kind: 's' | 'q' | 'i' | 'd' | 'f';
  count: number;
  parentId?: string;
}
export interface Binding {
  reservationId: string;
  slots: Slot[];
}
export interface ServerPreview {
  previewFingerprint: string;
  counts: Record<string, { before: number; after: number; created: number; updated: number; deleted: number }>;
  affectedIds: Record<string, string[]>;
  totalAffected: Record<string, number>;
  requiresFreshAuthentication: boolean;
  validation: { warnings: number };
}
export class AdminHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    details = '',
  ) {
    super(
      code === 'draft_base_stale'
        ? 'The draft base differs from the current publication. Explicitly reset the paired draft before publishing; your unsaved text is kept.'
        : code === 'draft_uninitialized'
          ? 'The paired draft is not initialized. An operator must initialize it before editing.'
          : code === 'admin_disabled'
            ? 'Private editor access is disabled for this backend.'
            : status === 401
              ? 'Your session expired. Your unsaved text is kept. Sign in and preview again.'
              : status === 409
                ? 'The draft or publication changed. Your unsaved text is kept. Refresh context and review again.'
                : status === 403
                  ? 'Sign in again to refresh authentication, then review and confirm again.'
                  : 'The editor request failed. Your unsaved text is kept.' + details,
    );
  }
}
export interface PendingOperation {
  operationId: string;
  path: string;
}

/** One attempt per write. Cookies are HttpOnly; CSRF and uncertain receipts stay in memory. */
export class PairedHttpClient {
  session?: SessionStatus;
  pending?: PendingOperation;
  inFlight = false;
  commandBusy = false;
  authenticationRequired = false;
  private readonly listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
  /** Admit one complete editor command, including preview and review, synchronously. */
  async runCommand<T>(action: () => Promise<T>, allowPending = false): Promise<T> {
    if (this.commandBusy || this.inFlight) throw new Error('Wait for the current authoring command to finish.');
    if (this.pending && !allowPending) throw new Error('Check save status before another authoring command.');
    if (this.authenticationRequired && !allowPending) throw new Error('Sign in to continue; your text is kept.');
    this.commandBusy = true;
    this.notify();
    try {
      return await action();
    } finally {
      this.commandBusy = false;
      this.notify();
    }
  }
  constructor(
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly timeoutMs = 180000,
  ) {}
  private async request<T>(path: string, body?: unknown, binary = false): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher('/api/admin' + path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers:
          body === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'X-CSRF-Token': this.session?.csrfToken ?? '' },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.authenticationRequired = true;
          this.notify();
        }
        const value = await response.json().catch(() => ({}));
        const issues = Array.isArray(value?.error?.issues)
          ? value.error.issues
              .slice(0, 5)
              .map(
                (issue: { path?: string; message?: string }) =>
                  `${String(issue.path ?? '').slice(0, 200)}: ${String(issue.message ?? '').slice(0, 500)}`,
              )
              .join('; ')
          : '';
        throw new AdminHttpError(response.status, value?.error?.code ?? 'request_failed', issues ? ' ' + issues : '');
      }
      return (binary ? await response.blob() : await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
  async refreshSession(): Promise<SessionStatus> {
    this.session = await this.request<SessionStatus>('/session');
    this.authenticationRequired = !this.session.authenticated || (this.authenticationRequired && !this.session.fresh);
    this.notify();
    return this.session;
  }
  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, body);
  }
  async mutate<T>(path: string, body: Record<string, unknown>): Promise<T> {
    if (this.pending) throw new Error('Reconcile the uncertain operation before another write.');
    const operationId = crypto.randomUUID();
    this.pending = { operationId, path };
    this.inFlight = true;
    this.notify();
    try {
      const result = await this.post<T>(path, { ...body, operationId });
      this.pending = undefined;
      return result;
    } catch (error) {
      // An explicit rejection has no commit; lost/5xx responses are uncertain.
      if (error instanceof AdminHttpError && error.status < 500) this.pending = undefined;
      throw error;
    } finally {
      this.inFlight = false;
      this.notify();
    }
  }
  async reconcile(): Promise<{ committed: boolean; result?: Record<string, unknown> }> {
    if (this.inFlight) throw new Error('Wait for the current operation to finish.');
    if (!this.pending) throw new Error('There is no uncertain operation.');
    try {
      const result = await this.get<{ result: Record<string, unknown> }>('/operations/' + this.pending.operationId);
      this.pending = undefined;
      return { committed: true, result: result.result };
    } catch (error) {
      if (error instanceof AdminHttpError && error.status === 404) {
        this.pending = undefined;
        return { committed: false };
      }
      throw error;
    }
  }
  async authenticate(reauthenticate = false): Promise<Window> {
    // Open synchronously before awaiting network, preserving the mounted editor.
    const popup = window.open('about:blank', 'meducation-admin-login', 'popup,width=580,height=720');
    if (!popup) throw new Error('Allow the sign-in window, then try again. Your edits are kept.');
    try {
      await this.refreshSession();
      const flow = await this.post<{ authorizationUrl: string }>(
        reauthenticate && this.session?.authenticated ? '/auth/reauthenticate' : '/auth/login',
        {},
      );
      const target = new URL(flow.authorizationUrl);
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Invalid sign-in destination.');
      popup.location.href = target.href;
      return popup;
    } catch (error) {
      popup.close();
      throw error;
    }
  }
  async export(body: unknown): Promise<Blob> {
    return this.request<Blob>('/exports', body, true);
  }
}
export const expectedContext = (snapshot: PairedSnapshot) => ({
  draftRevision: snapshot.draft.revision,
  publicationSequence: snapshot.publication.sequence,
});
