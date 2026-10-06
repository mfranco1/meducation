import { Box, Button, Card, CardContent, Chip, FormControl, InputLabel, MenuItem, Select, Skeleton, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';
import type { Subject } from '../../domain/types';
import type { FlashcardCheckpoint } from '../../domain/flashcardStudy';
import type { FlashcardDeckSummary, FlashcardCatalogResponse } from '../../content/flashcardApiDecoders';
import { decksForSubject } from '../flashcards';
import { SubjectBrowseLayout } from '../components/SubjectBrowseLayout';
import { ContentRecoveryBanner } from '../components/ContentRecoveryBanner';

export function FlashcardSubjectScreen({ subject, catalog, checkpoints, selectedTopicId, loading = false, error, errorKind = 'catalog', loadingDeckId, onRetry, onBack, onSelectTopic, onSelectDeck }: {
  subject: Subject;
  catalog?: FlashcardCatalogResponse;
  checkpoints: Readonly<Record<string, FlashcardCheckpoint>>;
  selectedTopicId?: string;
  loading?: boolean;
  error?: Error;
  errorKind?: 'catalog' | 'cards';
  loadingDeckId?: string;
  onRetry: () => void | Promise<void>;
  onBack: () => void;
  onSelectTopic: (topicId?: string) => void;
  onSelectDeck: (deck: FlashcardDeckSummary) => void;
}) {
  const decks = useMemo(() => decksForSubject(catalog?.decks ?? [], checkpoints, selectedTopicId), [catalog?.decks, checkpoints, selectedTopicId]);
  return <>
    {error && <ContentRecoveryBanner title={errorKind === 'cards' ? 'We can’t load this deck right now.' : `We can’t load flashcard topics for ${subject.name} right now.`} description="Your saved deck positions are safe. Please try again." error={error} onRetry={onRetry} />}
    <SubjectBrowseLayout subjectName={subject.name} onBack={onBack}>
      {catalog && catalog.topics.length > 0 && <FormControl size="small" sx={{ minWidth: 220, mb: 3 }}>
        <InputLabel id="flashcard-topic-filter-label" shrink>Topic</InputLabel>
        <Select displayEmpty labelId="flashcard-topic-filter-label" label="Topic" value={selectedTopicId ?? ''} onChange={event => onSelectTopic(event.target.value || undefined)}>
          <MenuItem value="">All Topics</MenuItem>
          {catalog.topics.map(topic => <MenuItem key={topic.id} value={topic.id}>{topic.name} ({topic.deckCount})</MenuItem>)}
        </Select>
      </FormControl>}
      {error || loading ? <Stack spacing={2} role="status" aria-busy={loading} aria-label={loading ? 'Loading flashcard topics and decks' : undefined}>{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="rounded" height={92} />)}</Stack>
        : decks.length === 0 ? <Typography color="text.secondary">{selectedTopicId ? 'No decks are available in this topic yet.' : 'No flashcard decks are available in this subject yet.'}</Typography>
          : <Stack spacing={2}>{decks.map(deck => <FlashcardDeckRow key={deck.id} deck={deck} topicName={catalog?.topics.find(topic => topic.id === deck.topicId)?.name ?? deck.topicId} checkpoints={checkpoints} loading={loadingDeckId === deck.id} onSelect={() => onSelectDeck(deck)} />)}</Stack>}
    </SubjectBrowseLayout>
  </>;
}

function FlashcardDeckRow({ deck, topicName, checkpoints, loading, onSelect }: { deck: FlashcardDeckSummary; topicName: string; checkpoints: Readonly<Record<string, FlashcardCheckpoint>>; loading: boolean; onSelect: () => void }) {
  const checkpoint = checkpoints[deck.id];
  const index = checkpoint ? deck.cardIds.indexOf(checkpoint.currentCardId) : -1;
  const disabled = deck.cardCount === 0 || loading;
  return <Card><CardContent>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
      <Box>
        <Typography variant="h6">{deck.name}</Typography>
        <Typography variant="body2" color="text.secondary">{topicName} · {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}</Typography>
        {checkpoint && index >= 0 && <Chip label={`Card ${index + 1} of ${deck.cardCount}`} size="small" variant="outlined" sx={{ mt: 1 }} />}
      </Box>
      <Button variant="contained" disabled={disabled} onClick={onSelect}>
        {loading ? 'Loading deck…' : deck.cardCount === 0 ? 'No cards yet' : checkpoint ? 'Resume deck' : 'Study deck'}
      </Button>
    </Stack>
  </CardContent></Card>;
}
