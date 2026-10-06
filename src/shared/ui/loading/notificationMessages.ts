import { ContentLoadError } from '../../../content/contentTransport';

export function contentLoadMessage(error?: Error) {
  if (!(error instanceof ContentLoadError)) return 'Please try again or come back later.';
  if (error.kind === 'revision') return 'The available content has changed. Reload to continue with the latest version.';
  if (error.kind === 'network') return 'Check your connection and try again.';
  if (error.kind === 'timeout') return 'This is taking longer than expected. Please try again later.';
  return 'Please try again or come back later.';
}
