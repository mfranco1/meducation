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

class TestIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  disconnect() {}
  observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  takeRecords() { return []; }
  unobserve() {}
}

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  disconnect() {}
  observe(target: Element) { this.callback([{ contentRect: target.getBoundingClientRect(), target } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  unobserve() {}
}

Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: TestIntersectionObserver });
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: TestResizeObserver });
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: TestIntersectionObserver });
Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: TestResizeObserver });

afterEach(() => {
  cleanup();
  window.matchMedia = matchMedia();
});
