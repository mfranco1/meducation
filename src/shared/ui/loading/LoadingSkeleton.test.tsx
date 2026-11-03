import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingSkeleton } from './LoadingSkeleton';
import { matchMediaFor } from '../../../test/setup';

describe('loading skeleton motion', () => {
  it('shimmers by default', () => {
    const { container } = render(<LoadingSkeleton variant="rounded" height={80} />);
    expect(container.querySelector('.MuiSkeleton-wave')).not.toBeNull();
  });

  it('stays static for reduced motion', () => {
    window.matchMedia = matchMediaFor((query) => query === '(prefers-reduced-motion: reduce)');
    const { container } = render(<LoadingSkeleton variant="rounded" height={80} />);
    expect(container.querySelector('.MuiSkeleton-wave')).toBeNull();
  });
});
