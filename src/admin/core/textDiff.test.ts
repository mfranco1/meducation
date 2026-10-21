import { describe, expect, it } from 'vitest';
import { diffWords } from './textDiff';

describe('diffWords', () => {
  it('marks only the words that changed', () => {
    expect(diffWords('Give 5 mg IV now', 'Give 10 mg IV now')).toEqual([
      { text: 'Give ' },
      { text: '5 ', change: 'removed' },
      { text: '10 ', change: 'added' },
      { text: 'mg IV now' },
    ]);
  });

  it('rebuilds both texts from the parts', () => {
    const parts = diffWords('alpha beta\ngamma', 'beta gamma delta');
    expect(parts.filter((p) => p.change !== 'added').map((p) => p.text).join('')).toBe('alpha beta\ngamma');
    expect(parts.filter((p) => p.change !== 'removed').map((p) => p.text).join('')).toBe('beta gamma delta');
  });
});
