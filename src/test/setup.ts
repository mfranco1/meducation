import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

const matchMedia = (matches = false) => vi.fn().mockImplementation((query: string) => ({
  matches,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia() });

afterEach(() => {
  cleanup();
  window.matchMedia = matchMedia();
});
