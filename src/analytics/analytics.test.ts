import { describe, expect, it } from 'vitest';
import { averageScore, lowestScore, mostRecentScore, scoreTrend } from './analytics';

describe('score summaries', () => {
  it('returns the lowest completed score', () => {
    expect(lowestScore([78, 43, 91, 43])).toBe(43);
    expect(lowestScore([])).toBeUndefined();
  });

  it('averages scores with equal subject weight and rounds to a whole percent', () => {
    expect(averageScore([40, 61, 72])).toBe(58);
    expect(averageScore([])).toBeUndefined();
  });

  it('returns the score from the latest completed attempt', () => {
    expect(mostRecentScore([
      { percentage: 56, completedAt: '2026-09-01T12:00:00.000Z' },
      { percentage: 74, completedAt: '2026-09-05T12:00:00.000Z' },
      { percentage: 62, completedAt: '2026-09-03T12:00:00.000Z' },
    ])).toEqual({ percentage: 74, completedAt: '2026-09-05T12:00:00.000Z' });
    expect(mostRecentScore([])).toBeUndefined();
  });

  it('compares the two most recent completed scores', () => {
    expect(scoreTrend([
      { percentage: 56, completedAt: '2026-09-01T12:00:00.000Z' },
      { percentage: 74, completedAt: '2026-09-05T12:00:00.000Z' },
      { percentage: 62, completedAt: '2026-09-03T12:00:00.000Z' },
    ])).toBe('increase');
    expect(scoreTrend([
      { percentage: 74, completedAt: '2026-09-01T12:00:00.000Z' },
      { percentage: 56, completedAt: '2026-09-05T12:00:00.000Z' },
    ])).toBe('decrease');
    expect(scoreTrend([
      { percentage: 74, completedAt: '2026-09-01T12:00:00.000Z' },
      { percentage: 74, completedAt: '2026-09-05T12:00:00.000Z' },
    ])).toBe('unchanged');
    expect(scoreTrend([{ percentage: 74, completedAt: '2026-09-05T12:00:00.000Z' }])).toBeUndefined();
  });
});
