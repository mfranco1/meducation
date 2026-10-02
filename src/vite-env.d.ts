/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTENT_MAX_RETRIES?: string;
  readonly VITE_CONTENT_RETRY_BASE_DELAY_MS?: string;
  readonly VITE_CONTENT_RETRY_MAX_DELAY_MS?: string;
}
