import { logContentDiagnostic } from './contentLogger';

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const defaults: RetryPolicy = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 8000 };

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= min && parsed <= max) return parsed;
  logContentDiagnostic('Invalid retry configuration; using default.', { setting: name });
  return fallback;
}

function boundedDelay(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 30_000) return Math.max(1, Math.floor(parsed));
  logContentDiagnostic('Invalid retry configuration; using default.', { setting: name });
  return fallback;
}

export function readRetryPolicy(env: Record<string, string | undefined>): RetryPolicy {
  const maxRetries = boundedInteger(env.VITE_CONTENT_MAX_RETRIES, defaults.maxRetries, 0, 5, 'VITE_CONTENT_MAX_RETRIES');
  let baseDelayMs = boundedDelay(env.VITE_CONTENT_RETRY_BASE_DELAY_MS, defaults.baseDelayMs, 'VITE_CONTENT_RETRY_BASE_DELAY_MS');
  let maxDelayMs = boundedDelay(env.VITE_CONTENT_RETRY_MAX_DELAY_MS, defaults.maxDelayMs, 'VITE_CONTENT_RETRY_MAX_DELAY_MS');
  if (baseDelayMs > maxDelayMs) {
    logContentDiagnostic('Retry base delay exceeds maximum; using default delays.', {});
    baseDelayMs = defaults.baseDelayMs;
    maxDelayMs = defaults.maxDelayMs;
  }
  return { maxRetries, baseDelayMs, maxDelayMs };
}

export const contentRetryPolicy = readRetryPolicy(import.meta.env);

export function retryDelayMs(retryNumber: number, policy: RetryPolicy, random: () => number = Math.random): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** Math.max(0, retryNumber - 1)));
  return Math.floor(ceiling / 2 + Math.min(1, Math.max(0, random())) * (ceiling / 2));
}

export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
