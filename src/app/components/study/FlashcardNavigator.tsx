import { Box, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useRef } from 'react';
import type { FlashcardCard } from '../../../domain/types';
import { filterFlashcardIndices, type FlashcardNavigatorFilter } from '../../../domain/flashcardStudy';
import { useScrollCurrentQuestion } from '../quiz/useScrollCurrentQuestion';
import { StudyNavigatorEmpty, StudyNavigatorTile } from './StudyNavigatorTile';

export function FlashcardNavigator({ cards, currentIndex, openedCardIds, flaggedCardIds, filter, onFilterChange, onNavigate }: {
  cards: readonly FlashcardCard[]; currentIndex: number; openedCardIds: readonly string[]; flaggedCardIds: readonly string[]; filter: FlashcardNavigatorFilter; onFilterChange: (filter: FlashcardNavigatorFilter) => void; onNavigate: (index: number) => void;
}) {
  const visible = filterFlashcardIndices(cards, openedCardIds, flaggedCardIds, filter);
  const scrollArea = useRef<HTMLDivElement>(null);
  const tile = useRef<HTMLButtonElement>(null);
  useScrollCurrentQuestion(scrollArea, tile, [currentIndex, filter, visible.join(',')]);
  const openedSet = new Set(openedCardIds);
  const flaggedSet = new Set(flaggedCardIds);
  const counts = { all: cards.length, unopened: cards.reduce((count, card) => count + Number(!openedSet.has(card.id)), 0), flagged: cards.reduce((count, card) => count + Number(flaggedSet.has(card.id)), 0) };
  const empty = filter === 'unopened' ? 'No hidden cards.' : 'No flagged cards.';

  return <Stack spacing={2} aria-label="Card navigator">
    <ToggleButtonGroup value={filter} exclusive fullWidth size="small" aria-label="Filter cards" onChange={(_, value: FlashcardNavigatorFilter | null) => { if (value) onFilterChange(value); }}>
      <ToggleButton value="all" aria-label={`All cards, ${counts.all}`}>All</ToggleButton>
      <ToggleButton value="unopened" aria-label={`Hidden cards, ${counts.unopened}`}>Hidden</ToggleButton>
      <ToggleButton value="flagged" aria-label={`Flagged cards, ${counts.flagged}`}>Flagged</ToggleButton>
    </ToggleButtonGroup>
    <Box ref={scrollArea} sx={{ overflowY: 'auto', maxHeight: { xs: 'calc(100vh - 110px)', md: 470 }, p: .75 }}>
      {visible.length ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1 }}>
        {visible.map(index => {
          const card = cards[index];
          const isOpened = openedSet.has(card.id);
          const flagged = flaggedSet.has(card.id);
          return <StudyNavigatorTile key={card.id} number={index + 1} label="Card" current={index === currentIndex} highlighted={isOpened} flagged={flagged} status={[isOpened ? 'opened' : 'unopened', flagged ? 'flagged' : undefined].filter(Boolean).join(', ')} onClick={() => onNavigate(index)} tileRef={index === currentIndex ? tile : undefined} />;
        })}
      </Box> : <StudyNavigatorEmpty>{empty}</StudyNavigatorEmpty>}
    </Box>
  </Stack>;
}
