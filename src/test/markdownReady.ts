import { createElement } from 'react';
import { render, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { MarkdownContent } from '../shared/ui/content/MarkdownContent';

// MarkdownContent loads its renderer lazily. Call once in beforeAll so tests render content synchronously.
export async function markdownReady() {
  const { container, unmount } = render(createElement(MarkdownContent, { markdown: 'ready' }));
  await waitFor(() => expect(container.querySelector('p')).not.toBeNull(), { timeout: 20000 });
  unmount();
}
