import { Button, Stack } from '@mui/material';
import type { Subject } from '../../../domain/types';
import type { FlashcardCheckpoint } from '../../../domain/flashcardStudy';
import type { FlashcardDeckSummary, FlashcardCatalogResponse } from '../../../content/api/flashcardApiDecoders';
import { SubjectBrowseLayout } from '../../../shared/ui/catalog/SubjectBrowseLayout';
import { TopicSetBrowser, type TopicSet } from '../../../shared/ui/catalog/TopicSetBrowser';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { LoadingSkeleton } from '../../../shared/ui/loading/LoadingSkeleton';
import { SubjectCatalogEmptyState } from '../../../shared/ui/catalog/SubjectCatalogEmptyState';

export function FlashcardSubjectScreen({ subject, catalog, checkpoints, completionCounts, loading = false, error, loadingDeckId, onRetry, onBack, onSelectDeck }: {
  subject: Subject;
  catalog?: FlashcardCatalogResponse;
  checkpoints: Readonly<Record<string, FlashcardCheckpoint>>;
  completionCounts: Readonly<Record<string, number>>;
  loading?: boolean;
  error?: Error;
  loadingDeckId?: string;
  onRetry: () => void | Promise<void>;
  onBack: () => void;
  onSelectDeck: (deck: FlashcardDeckSummary) => void;
}) {
  const decks = catalog?.decks ?? [];
  const showSets = !(error || loading) && decks.length > 0;
  const sets = decks.map(deck => deckSet(deck, checkpoints[deck.id], completionCounts[deck.id] ?? 0, loadingDeckId === deck.id, () => onSelectDeck(deck)));
  return <>
    {error && <ContentRecoveryBanner title={`We can’t load flashcard decks for ${subject.name} right now.`} description="Your saved deck positions are safe. Please try again." error={error} onRetry={onRetry} />}
    <SubjectBrowseLayout subjectId={subject.id} subjectName={subject.name} progress={showSets ? { completed: decks.filter(deck => (completionCounts[deck.id] ?? 0) > 0).length, total: decks.length, nouns: 'decks' } : undefined} onBack={onBack}>
      {error || loading ? <Stack spacing={2} role={loading ? 'status' : undefined} aria-busy={loading} aria-hidden={!loading} aria-label={loading ? 'Loading flashcard decks' : undefined}>{Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} variant="rounded" height={92} />)}</Stack>
        : decks.length === 0 ? <SubjectCatalogEmptyState title="No flashcard decks available yet" />
          : <TopicSetBrowser topics={catalog?.topics ?? []} sets={sets} noun="deck" />}
    </SubjectBrowseLayout>
  </>;
}

function deckSet(deck: FlashcardDeckSummary, checkpoint: FlashcardCheckpoint | undefined, completionCount: number, loading: boolean, onSelect: () => void): TopicSet {
  const inProgress = checkpoint !== undefined && deck.cardIds.includes(checkpoint.currentCardId);
  return {
    id: deck.id,
    topicId: deck.topicId,
    name: deck.name,
    detail: `${deck.cardCount} ${deck.cardCount === 1 ? 'card' : 'cards'}`,
    completionCount,
    activityAt: checkpoint?.updatedAt,
    progress: inProgress ? { done: checkpoint.openedCardIds.filter(id => deck.cardIds.includes(id)).length, total: deck.cardCount, label: 'reviewed' } : undefined,
    chips: [],
    action: <Button variant="contained" aria-label={loading || deck.cardCount === 0 ? undefined : `${checkpoint ? 'Resume' : 'Study'} deck: ${deck.name}`} disabled={deck.cardCount === 0 || loading} onClick={onSelect}>
      {loading ? 'Loading deck…' : deck.cardCount === 0 ? 'No cards yet' : checkpoint ? 'Resume' : 'Study'}
    </Button>,
  };
}
