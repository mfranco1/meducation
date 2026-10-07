import { describe, expect, it } from 'vitest';
import {
  calendarDayOrdinal,
  flashcardDashboardStats,
  isFlashcardDailyStats,
  localDayKey,
  recordFlashcardDailyCompletion,
} from './flashcardDailyStats';

describe('flashcard daily completion statistics', () => {
  it('starts tracking on the first finish and counts repeat finishes', () => {
    const first = recordFlashcardDailyCompletion(undefined, '2026-10-07');
    expect(first).toEqual({ firstDay: '2026-10-07', currentDay: '2026-10-07', currentDayCount: 1, trackedCompletions: 1, highestDailyCount: 1 });
    const repeated = recordFlashcardDailyCompletion(first, '2026-10-07');
    expect(repeated).toEqual({ ...first, currentDayCount: 2, trackedCompletions: 2, highestDailyCount: 2 });
  });

  it('counts idle calendar days in the average without storing a record for each day', () => {
    const stats = recordFlashcardDailyCompletion(undefined, '2026-01-31');
    expect(flashcardDashboardStats({ d1: 2 }, stats, new Date(2026, 1, 2, 10))).toEqual({ completedDecks: 2, averagePerDay: 1 / 3, highestInDay: 1 });
    const later = recordFlashcardDailyCompletion(stats, '2026-02-03');
    expect(later).toEqual({ firstDay: '2026-01-31', currentDay: '2026-02-03', currentDayCount: 1, trackedCompletions: 2, highestDailyCount: 1 });
    expect(flashcardDashboardStats({ d1: 2 }, later, new Date(2026, 1, 3, 10)).averagePerDay).toBe(0.5);
    expect(Object.keys(later)).toHaveLength(5);
  });

  it('uses local calendar dates and does not count a pre-midnight finish on the next day', () => {
    const beforeMidnight = new Date(2026, 9, 6, 23, 59, 59);
    const atMidnight = new Date(2026, 9, 7, 0, 0, 0);
    expect(localDayKey(beforeMidnight)).toBe('2026-10-06');
    expect(localDayKey(atMidnight)).toBe('2026-10-07');
    const stats = recordFlashcardDailyCompletion(undefined, localDayKey(beforeMidnight));
    expect(recordFlashcardDailyCompletion(stats, localDayKey(atMidnight))).toMatchObject({ currentDay: '2026-10-07', currentDayCount: 1, trackedCompletions: 2 });
  });

  it('uses calendar ordinals across month, leap-year, DST, and year boundaries', () => {
    expect(calendarDayOrdinal('2024-03-01') - calendarDayOrdinal('2024-02-28')).toBe(2);
    expect(calendarDayOrdinal('2026-01-01') - calendarDayOrdinal('2025-12-31')).toBe(1);
    expect(calendarDayOrdinal('2026-03-09') - calendarDayOrdinal('2026-03-08')).toBe(1);
    expect(calendarDayOrdinal('2026-11-02') - calendarDayOrdinal('2026-11-01')).toBe(1);
  });

  it('clamps a backward clock to the latest tracked day and validates compact records', () => {
    const later = recordFlashcardDailyCompletion(undefined, '2026-10-07');
    const earlier = recordFlashcardDailyCompletion(later, '2026-10-05');
    expect(earlier).toEqual({ ...later, currentDayCount: 2, trackedCompletions: 2, highestDailyCount: 2 });
    expect(flashcardDashboardStats({}, later, new Date(2026, 9, 5, 12)).averagePerDay).toBe(1);
    expect(isFlashcardDailyStats(earlier)).toBe(true);
    expect(isFlashcardDailyStats({ ...earlier, currentDay: '2026-02-30' })).toBe(false);
    expect(isFlashcardDailyStats({ ...earlier, extra: 1 })).toBe(false);
    expect(() => recordFlashcardDailyCompletion(later, 'not-a-date')).toThrow();
  });

  it('includes legacy per-deck totals but starts daily figures at zero until the first tracked finish', () => {
    expect(flashcardDashboardStats({ d1: 4, d2: 2 }, undefined, new Date(2026, 9, 7))).toEqual({ completedDecks: 6, averagePerDay: 0, highestInDay: 0 });
  });
});
