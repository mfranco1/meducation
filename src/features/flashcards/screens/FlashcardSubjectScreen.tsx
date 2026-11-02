import { Box, Button } from '@mui/material';
import type { Subject } from '../../../domain/types';
import type { FlashcardCheckpoint } from '../../../domain/flashcardStudy';
import type { FlashcardDeckSummary, FlashcardCatalogResponse } from '../../../content/api/flashcardApiDecoders';
import { TopicSetBrowser, TopicSetBrowserSkeleton, type TopicSet } from '../../../shared/ui/catalog/TopicSetBrowser';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { SubjectCatalogEmptyState } from '../../../shared/ui/catalog/SubjectCatalogEmptyState';

export function FlashcardSubjectScreen({ subject, catalog, continueStudying = false, checkpoints, completionCounts, finishedAt, loading = false, error, loadingDeckId, onRetry, onSelectDeck, onPrepareDeck = () => undefined }: {
  subject: Subject;
  catalog?: FlashcardCatalogResponse;
  continueStudying?: boolean;
  checkpoints: Readonly<Record<string, FlashcardCheckpoint>>;
  completionCounts: Readonly<Record<string, number>>;
  finishedAt: Readonly<Record<string, string>>;
  loading?: boolean;
  error?: Error;
  loadingDeckId?: string;
  onRetry: () => void | Promise<void>;
  onSelectDeck: (deck: FlashcardDeckSummary) => void;
  onPrepareDeck?: (deck: FlashcardDeckSummary) => void;
}) {
  const decks = catalog?.decks ?? [];
  const sets = decks.map(deck => deckSet(deck, checkpoints[deck.id], completionCounts[deck.id] ?? 0, finishedAt[deck.id], loadingDeckId === deck.id, () => onSelectDeck(deck), () => onPrepareDeck(deck)));
  const initialSetId = continueStudying ? decks.filter(deck => deck.cardCount > 0 && checkpoints[deck.id])
    .sort((a, b) => checkpoints[b.id].updatedAt.localeCompare(checkpoints[a.id].updatedAt))[0]?.id : undefined;
  return <>
    {error && <ContentRecoveryBanner title={`We can’t load flashcard decks for ${subject.name} right now.`} description="Your saved deck positions are safe. Please try again." error={error} onRetry={onRetry} />}
    {error || loading ? <Box role={loading ? 'status' : undefined} aria-busy={loading} aria-hidden={!loading} aria-label={loading ? 'Loading flashcard decks' : undefined}><TopicSetBrowserSkeleton noun="deck" dashed={!loading} /></Box>
      : decks.length === 0 ? <SubjectCatalogEmptyState title="No flashcard decks available yet" />
        : <TopicSetBrowser topics={catalog?.topics ?? []} sets={sets} noun="deck" initialSetId={initialSetId} />}
  </>;
}

function deckSet(deck: FlashcardDeckSummary, checkpoint: FlashcardCheckpoint | undefined, completionCount: number, finishedAt: string | undefined, loading: boolean, onSelect: () => void, onPrepare: () => void): TopicSet {
  const inProgress = checkpoint !== undefined && deck.cardIds.includes(checkpoint.currentCardId);
  return {
    id: deck.id,
    topicId: deck.topicId,
    name: deck.name,
    detail: `${deck.cardCount} ${deck.cardCount === 1 ? 'card' : 'cards'}`,
    completionCount,
    activityAt: [checkpoint?.updatedAt, finishedAt].filter(Boolean).sort().at(-1),
    progress: inProgress ? { done: checkpoint.openedCardIds.filter(id => deck.cardIds.includes(id)).length, total: deck.cardCount, label: 'reviewed' } : undefined,
    chips: [],
    action: <Button variant="contained" aria-label={loading || deck.cardCount === 0 ? undefined : `${checkpoint ? 'Resume' : 'Study'} deck: ${deck.name}`} disabled={deck.cardCount === 0 || loading} onPointerEnter={onPrepare} onFocus={onPrepare} onClick={onSelect}>
      {loading ? 'Loading deck…' : deck.cardCount === 0 ? 'No cards yet' : checkpoint ? 'Resume' : 'Study'}
    </Button>,
  };
}
