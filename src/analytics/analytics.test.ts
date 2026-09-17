import { describe, expect, it } from 'vitest';
import { averageScore, lowestScore } from './analytics';

describe('score summaries', () => {
  it('returns the lowest completed score', () => {
    expect(lowestScore([78, 43, 91, 43])).toBe(43);
    expect(lowestScore([])).toBeUndefined();
  });

  it('averages subject lows with equal weight and rounds to a whole percent', () => {
    expect(averageScore([40, 61, 72])).toBe(58);
    expect(averageScore([])).toBeUndefined();
  });
});
