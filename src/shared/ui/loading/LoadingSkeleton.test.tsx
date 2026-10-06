import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoadingSkeleton } from './LoadingSkeleton';

describe('loading skeleton motion', () => {
  it('shimmers by default', () => {
    const { container } = render(<LoadingSkeleton variant="rounded" height={80} />);
    expect(container.querySelector('.MuiSkeleton-wave')).not.toBeNull();
  });

  it('stays static for reduced motion', () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = render(<LoadingSkeleton variant="rounded" height={80} />);
    expect(container.querySelector('.MuiSkeleton-wave')).toBeNull();
  });
});
