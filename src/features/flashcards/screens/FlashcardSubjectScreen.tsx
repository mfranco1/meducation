import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';
import type { Subject } from '../../../domain/types';
import type { FlashcardCheckpoint } from '../../../domain/flashcardStudy';
import type { FlashcardDeckSummary, FlashcardCatalogResponse } from '../../../content/api/flashcardApiDecoders';
import { decksForSubject } from '../selectors/flashcards';
import { SubjectBrowseLayout } from '../../../shared/ui/catalog/SubjectBrowseLayout';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { LoadingSkeleton } from '../../../shared/ui/loading/LoadingSkeleton';

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
  const decks = useMemo(() => decksForSubject(catalog?.decks ?? [], checkpoints), [catalog?.decks, checkpoints]);
  return <>
    {error && <ContentRecoveryBanner title={`We can’t load flashcard decks for ${subject.name} right now.`} description="Your saved deck positions are safe. Please try again." error={error} onRetry={onRetry} />}
    <SubjectBrowseLayout subjectName={subject.name} onBack={onBack}>
      {error || loading ? <Stack spacing={2} role={loading ? 'status' : undefined} aria-busy={loading} aria-hidden={!loading} aria-label={loading ? 'Loading flashcard decks' : undefined}>{Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} variant="rounded" height={92} />)}</Stack>
        : decks.length === 0 ? <Typography color="text.secondary">No flashcard decks are available in this subject yet.</Typography>
          : <Stack spacing={2}>{decks.map(deck => <FlashcardDeckRow key={deck.id} deck={deck} checkpoints={checkpoints} completionCount={completionCounts[deck.id] ?? 0} loading={loadingDeckId === deck.id} onSelect={() => onSelectDeck(deck)} />)}</Stack>}
    </SubjectBrowseLayout>
  </>;
}

function FlashcardDeckRow({ deck, checkpoints, completionCount, loading, onSelect }: { deck: FlashcardDeckSummary; checkpoints: Readonly<Record<string, FlashcardCheckpoint>>; completionCount: number; loading: boolean; onSelect: () => void }) {
  const checkpoint = checkpoints[deck.id];
  const index = checkpoint ? deck.cardIds.indexOf(checkpoint.currentCardId) : -1;
  const disabled = deck.cardCount === 0 || loading;
  return <Card><CardContent>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
      <Box>
        <Typography variant="h6">{deck.name}</Typography>
        <Typography variant="body2" color="text.secondary">{deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}</Typography>
        {(completionCount > 0 || (checkpoint && index >= 0)) && <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          {completionCount > 0 && <Chip label={`Completed ${completionCount} ${completionCount === 1 ? 'time' : 'times'}`} size="small" variant="outlined" />}
          {checkpoint && index >= 0 && <Chip label={`Card ${index + 1} of ${deck.cardCount}`} size="small" variant="outlined" />}
        </Stack>}
      </Box>
      <Button variant="contained" disabled={disabled} onClick={onSelect}>
        {loading ? 'Loading deck…' : deck.cardCount === 0 ? 'No cards yet' : checkpoint ? 'Resume deck' : 'Study deck'}
      </Button>
    </Stack>
  </CardContent></Card>;
}
