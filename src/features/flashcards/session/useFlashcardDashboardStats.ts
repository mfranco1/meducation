import { useEffect, useState } from 'react';
import type { FlashcardProgressState } from '../../../domain/flashcardStudy';
import { flashcardDashboardStats } from '../../../domain/flashcardDailyStats';

export function useFlashcardDashboardStats(progress: FlashcardProgressState) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const scheduleMidnightRefresh = () => {
      const current = new Date();
      const nextMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 0, 25);
      const timeout = window.setTimeout(refresh, Math.max(1, nextMidnight.getTime() - current.getTime()));
      return () => window.clearTimeout(timeout);
    };

    const cancelMidnight = scheduleMidnightRefresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelMidnight();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [now]);

  return flashcardDashboardStats(progress.completionCounts, progress.dailyStats, now);
}
