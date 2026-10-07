export interface FlashcardDailyStats {
  firstDay: string;
  currentDay: string;
  currentDayCount: number;
  trackedCompletions: number;
  highestDailyCount: number;
}

export interface FlashcardDashboardStats {
  completedDecks: number;
  averagePerDay: number;
  highestInDay: number;
}

const dayMilliseconds = 24 * 60 * 60 * 1000;
const safePositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export function localDayKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Cannot create a local day key from an invalid date.');
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calendarDayOrdinal(dayKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error(`Invalid local day key: ${dayKey}`);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day))
    throw new Error(`Invalid local day key: ${dayKey}`);
  return Math.floor(date.getTime() / dayMilliseconds);
}

export function isFlashcardDailyStats(value: unknown): value is FlashcardDailyStats {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const stats = value as Record<string, unknown>;
  if (Object.keys(stats).some(key => !['firstDay', 'currentDay', 'currentDayCount', 'trackedCompletions', 'highestDailyCount'].includes(key))) return false;
  if (typeof stats.firstDay !== 'string' || typeof stats.currentDay !== 'string') return false;
  let firstOrdinal: number;
  let currentOrdinal: number;
  try {
    firstOrdinal = calendarDayOrdinal(stats.firstDay);
    currentOrdinal = calendarDayOrdinal(stats.currentDay);
  } catch {
    return false;
  }
  return firstOrdinal <= currentOrdinal
    && safePositiveInteger(stats.currentDayCount)
    && safePositiveInteger(stats.trackedCompletions)
    && safePositiveInteger(stats.highestDailyCount)
    && stats.currentDayCount <= stats.highestDailyCount
    && stats.highestDailyCount <= stats.trackedCompletions;
}

export function recordFlashcardDailyCompletion(stats: FlashcardDailyStats | undefined, day: string): FlashcardDailyStats {
  calendarDayOrdinal(day);
  if (!stats) return { firstDay: day, currentDay: day, currentDayCount: 1, trackedCompletions: 1, highestDailyCount: 1 };

  const effectiveDay = calendarDayOrdinal(day) < calendarDayOrdinal(stats.currentDay) ? stats.currentDay : day;
  const sameDay = effectiveDay === stats.currentDay;
  const currentDayCount = sameDay ? stats.currentDayCount + 1 : 1;
  const trackedCompletions = stats.trackedCompletions + 1;
  if (!Number.isSafeInteger(currentDayCount) || !Number.isSafeInteger(trackedCompletions))
    throw new RangeError('Flashcard daily completion statistics reached their storage limit.');
  return {
    firstDay: stats.firstDay,
    currentDay: effectiveDay,
    currentDayCount,
    trackedCompletions,
    highestDailyCount: Math.max(stats.highestDailyCount, currentDayCount),
  };
}

export function flashcardDashboardStats(
  completionCounts: Readonly<Record<string, number>>,
  dailyStats: FlashcardDailyStats | undefined,
  now = new Date(),
): FlashcardDashboardStats {
  const completedDecks = Object.values(completionCounts).reduce((total, count) => total + count, 0);
  if (!Number.isSafeInteger(completedDecks)) throw new RangeError('Flashcard completion total exceeds its safe display range.');
  if (!dailyStats) return { completedDecks, averagePerDay: 0, highestInDay: 0 };

  const today = localDayKey(now);
  const endDay = calendarDayOrdinal(today) < calendarDayOrdinal(dailyStats.currentDay) ? dailyStats.currentDay : today;
  const days = calendarDayOrdinal(endDay) - calendarDayOrdinal(dailyStats.firstDay) + 1;
  return {
    completedDecks,
    averagePerDay: dailyStats.trackedCompletions / days,
    highestInDay: dailyStats.highestDailyCount,
  };
}
