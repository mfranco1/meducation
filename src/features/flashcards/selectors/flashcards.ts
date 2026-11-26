import type { Subject } from '../../../domain/types';
import type { FlashcardCheckpoint, FlashcardProgressState } from '../../../domain/flashcardStudy';
import type { FlashcardDeckSummary, FlashcardSubjectSummary } from '../../../content/api/flashcardApiDecoders';

export interface FlashcardDashboardSubject {
  subject: Subject;
  deckCount: number;
  completedDeckCount: number;
  activeDeckCount: number;
  latestActiveAt?: string;
  /** Cards revealed in the most recently active deck. `total` is unknown until the subject's catalog loads. */
  latestActive?: { revealed: number; total?: number };
}

export function flashcardDashboardSubjects(
  subjects: readonly FlashcardSubjectSummary[],
  progress: FlashcardProgressState,
  getDeck: (deckId: string) => FlashcardDeckSummary | undefined = () => undefined,
): FlashcardDashboardSubject[] {
  return subjects.map((subject) => {
    const emptyDeckIds = new Set(subject.emptyDeckIds ?? []);
    const active = subject.deckIds
      .filter((deckId) => !emptyDeckIds.has(deckId))
      .map((deckId) => progress.checkpoints[deckId])
      .filter((checkpoint): checkpoint is FlashcardCheckpoint => checkpoint !== undefined);
    const latest = active.reduce<FlashcardCheckpoint | undefined>(
      (found, checkpoint) => (found === undefined || checkpoint.updatedAt > found.updatedAt ? checkpoint : found),
      undefined,
    );
    const latestDeck = latest && getDeck(latest.deckId);
    return {
      subject: {
        id: subject.id,
        name: subject.name,
        accent: subject.accent,
        ...(subject.description !== undefined && { description: subject.description }),
      },
      deckCount: subject.deckCount,
      completedDeckCount: subject.deckIds.filter((deckId) => (progress.completionCounts[deckId] ?? 0) > 0).length,
      activeDeckCount: active.length,
      latestActiveAt: latest?.updatedAt,
      latestActive: latest && {
        revealed: latestDeck
          ? Math.min(latest.openedCardIds.length, latestDeck.cardCount)
          : latest.openedCardIds.length,
        total: latestDeck?.cardCount,
      },
    };
  });
}

export function activeFlashcardSubjects(subjects: FlashcardDashboardSubject[]): FlashcardDashboardSubject[] {
  return subjects
    .map((subject, index) => ({ subject, index }))
    .filter(({ subject }) => subject.activeDeckCount > 0)
    .sort(
      (left, right) =>
        (right.subject.latestActiveAt ?? '').localeCompare(left.subject.latestActiveAt ?? '') ||
        left.index - right.index,
    )
    .map(({ subject }) => subject);
}
