export interface SessionStatus {
  authenticated: boolean;
  csrfToken: string;
  expiresAt?: number;
  fresh?: boolean;
}
export interface ServerIssue {
  path: string;
  code?: string;
  message: string;
}
/** The structured part of a server error that the editor can act on. */
export interface ErrorBody {
  message?: string;
  issues?: ServerIssue[];
  current?: unknown;
  children?: Record<string, number>;
}

function describe(status: number, code: string, body: ErrorBody): string {
  const issues = (body.issues ?? [])
    .slice(0, 5)
    .map((issue) => `${String(issue.path ?? '').slice(0, 200)}: ${String(issue.message ?? '').slice(0, 500)}`)
    .join('; ');
  if (code === 'admin_disabled') return 'Private editor access is disabled for this backend.';
  if (code === 'version_conflict') return 'This record changed on the server. Your unsaved text is kept.';
  if (status === 401) return 'Your session expired. Your unsaved text is kept. Sign in and try again.';
  if (status === 403) return 'Sign in again to refresh authentication, then try again. Your unsaved text is kept.';
  if (issues) return 'The server rejected the content. Your unsaved text is kept. ' + issues;
  return 'The editor request failed. Your unsaved text is kept.' + (body.message ? ' ' + body.message : '');
}
export class AdminHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: ErrorBody = {},
  ) {
    super(describe(status, code, body));
  }
}
/** Readable lines for any editor failure, one per server issue when there are several. */
export function errorMessages(error: unknown): string[] {
  if (error instanceof AdminHttpError && error.body.issues?.length)
    return [
      'The server rejected the content. Your unsaved text is kept.',
      ...error.body.issues.slice(0, 20).map((issue) => `${issue.path}: ${issue.message}`),
    ];
  return [error instanceof Error ? error.message : 'Editor request failed. Your text is kept.'];
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** One attempt per request. Cookies are HttpOnly; the CSRF token stays in memory. */
export class PairedHttpClient {
  session?: SessionStatus;
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
  /** Admit one complete editor command, which may be several requests, synchronously. */
  async runCommand<T>(action: () => Promise<T>): Promise<T> {
    if (this.commandBusy) throw new Error('Wait for the current authoring command to finish.');
    if (this.authenticationRequired) throw new Error('Sign in to continue; your text is kept.');
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
  private async request<T>(method: Method, path: string, body?: unknown, binary = false): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher('/api/admin' + path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers:
          method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': this.session?.csrfToken ?? '' },
        body: method === 'GET' || body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.authenticationRequired = true;
          this.notify();
        }
        const value = await response.json().catch(() => ({}));
        const { code, ...rest } = (value?.error ?? {}) as { code?: string } & ErrorBody;
        throw new AdminHttpError(response.status, code ?? 'request_failed', rest);
      }
      return (binary ? await response.blob() : await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
  async refreshSession(): Promise<SessionStatus> {
    this.session = await this.request<SessionStatus>('GET', '/session');
    this.authenticationRequired = !this.session.authenticated || (this.authenticationRequired && !this.session.fresh);
    this.notify();
    return this.session;
  }
  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  delete<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body);
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
    return this.request<Blob>('POST', '/exports', body, true);
  }
}
