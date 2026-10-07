import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlashcardProgressState } from '../../../domain/flashcardStudy';
import { useFlashcardDashboardStats } from './useFlashcardDashboardStats';

afterEach(() => vi.useRealTimers());

describe('useFlashcardDashboardStats', () => {
  it('refreshes the average at local midnight and when the window regains focus', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 23, 59, 50));
    const progress: FlashcardProgressState = {
      schemaVersion: 2,
      revision: 'r1',
      checkpoints: {},
      completionCounts: { d1: 1 },
      dailyStats: { firstDay: '2026-10-06', currentDay: '2026-10-06', currentDayCount: 1, trackedCompletions: 1, highestDailyCount: 1 },
    };
    const { result, unmount } = renderHook(() => useFlashcardDashboardStats(progress));
    expect(result.current.averagePerDay).toBe(1);

    act(() => vi.advanceTimersByTime(10_025));
    expect(result.current.averagePerDay).toBe(0.5);

    vi.setSystemTime(new Date(2026, 9, 8, 12));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current.averagePerDay).toBe(1 / 3);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rechecks the local date when the page becomes visible after sleep', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    const progress: FlashcardProgressState = {
      schemaVersion: 2,
      revision: 'r1',
      checkpoints: {},
      completionCounts: { d1: 1 },
      dailyStats: { firstDay: '2026-10-06', currentDay: '2026-10-06', currentDayCount: 1, trackedCompletions: 1, highestDailyCount: 1 },
    };
    const { result, unmount } = renderHook(() => useFlashcardDashboardStats(progress));
    expect(result.current.averagePerDay).toBe(1);

    const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    try {
      vi.setSystemTime(new Date(2026, 9, 7, 12));
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(result.current.averagePerDay).toBe(0.5);
    } finally {
      if (originalVisibilityState) Object.defineProperty(document, 'visibilityState', originalVisibilityState);
      else Reflect.deleteProperty(document, 'visibilityState');
      unmount();
    }
  });
});
