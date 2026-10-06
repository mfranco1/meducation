import type { Subject } from '../../../domain/types';
import type { FlashcardCheckpoint, FlashcardProgressState } from '../../../domain/flashcardStudy';
import type { FlashcardDeckSummary, FlashcardSubjectSummary } from '../../../content/flashcardApiDecoders';

export interface FlashcardDashboardSubject {
  subject: Subject;
  deckCount: number;
  activeDeckCount: number;
  latestActiveAt?: string;
}

export function flashcardDashboardSubjects(subjects: readonly FlashcardSubjectSummary[], progress: FlashcardProgressState): FlashcardDashboardSubject[] {
  return subjects.map(subject => {
    const emptyDeckIds = new Set(subject.emptyDeckIds ?? []);
    const active = subject.deckIds.filter(deckId => !emptyDeckIds.has(deckId)).map(deckId => progress.checkpoints[deckId]).filter((checkpoint): checkpoint is FlashcardCheckpoint => checkpoint !== undefined);
    return {
      subject: { id: subject.id, name: subject.name, accent: subject.accent },
      deckCount: subject.deckCount,
      activeDeckCount: active.length,
      latestActiveAt: active.map(checkpoint => checkpoint.updatedAt).sort().at(-1),
    };
  });
}

export function activeFlashcardSubjects(subjects: FlashcardDashboardSubject[]): FlashcardDashboardSubject[] {
  return subjects.map((subject, index) => ({ subject, index }))
    .filter(({ subject }) => subject.activeDeckCount > 0)
    .sort((left, right) => (right.subject.latestActiveAt ?? '').localeCompare(left.subject.latestActiveAt ?? '') || left.index - right.index)
    .map(({ subject }) => subject);
}

export function decksForSubject(decks: readonly FlashcardDeckSummary[], checkpoints: Readonly<Record<string, FlashcardCheckpoint>>): FlashcardDeckSummary[] {
  return decks.map((deck, index) => ({ deck, index }))
    .sort((left, right) => {
      const leftTime = checkpoints[left.deck.id]?.updatedAt;
      const rightTime = checkpoints[right.deck.id]?.updatedAt;
      if (leftTime && rightTime) return rightTime.localeCompare(leftTime) || left.index - right.index;
      if (leftTime) return -1;
      if (rightTime) return 1;
      return left.index - right.index;
    })
    .map(({ deck }) => deck);
}
