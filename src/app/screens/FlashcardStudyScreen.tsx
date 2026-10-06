import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Alert, Box, Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import { useLayoutEffect, useRef } from 'react';
import type { FlashcardCard } from '../../domain/types';
import type { FlashcardDeckSummary } from '../../content/flashcardApiDecoders';
import { MarkdownContent } from '../components/content/MarkdownContent';

export function FlashcardStudyScreen({ deck, cards, index, revealed, saving = false, persistenceError, onReveal, onPrevious, onNext, onSaveAndExit, onFinish }: {
  deck: FlashcardDeckSummary;
  cards: readonly FlashcardCard[];
  index: number;
  revealed: boolean;
  saving?: boolean;
  persistenceError?: string;
  onReveal: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSaveAndExit: () => void;
  onFinish: () => void;
}) {
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const finishButtonRef = useRef<HTMLButtonElement>(null);
  const advanceHadFocus = useRef(false);
  const card = cards[index];
  const last = Boolean(card && index >= cards.length - 1);
  useLayoutEffect(() => {
    if (last && advanceHadFocus.current) {
      finishButtonRef.current?.focus();
      advanceHadFocus.current = false;
    }
  }, [index, last]);
  if (!card) return null;
  return <Container maxWidth="md" sx={{ py: { xs: 3, sm: 5 } }}>
    {persistenceError && <Alert severity="error" sx={{ mb: 2 }}>{persistenceError}</Alert>}
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>{deck.name}</Typography>
        <Typography color="text.secondary">Card {index + 1} of {cards.length}</Typography>
      </Box>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={onSaveAndExit} disabled={saving}>Save and exit</Button>
    </Stack>
    <Card variant="outlined" sx={{ minHeight: { xs: 300, sm: 380 }, display: 'flex' }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 4 }, width: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="overline" color="text.secondary" sx={{ mb: 2 }}>{revealed ? 'Back' : 'Front'}</Typography>
        <Box aria-live="polite" sx={{ flex: 1, '& .katex-display': { maxWidth: '100%' } }}>
          <MarkdownContent markdown={revealed ? card.back : card.front} variant="stem" contentKind="rich" />
        </Box>
        {revealed && card.sources && <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>Source: <MarkdownContent markdown={card.sources} variant="inline" /></Typography>}
        <Stack direction="row" justifyContent="center" sx={{ mt: 3 }}>
          {!revealed && <Button variant="contained" onClick={onReveal}>Reveal answer</Button>}
          {revealed && <Button variant="outlined" onClick={onReveal}>Show front</Button>}
        </Stack>
      </CardContent>
    </Card>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 3 }}>
      <Button onClick={onPrevious} disabled={index === 0 || saving}>Previous</Button>
      {last
        ? <Button ref={finishButtonRef} color="success" variant="contained" onClick={onFinish} disabled={saving}>Finish deck</Button>
        : <Button ref={nextButtonRef} variant="contained" onClick={() => { advanceHadFocus.current = document.activeElement === nextButtonRef.current; onNext(); }} disabled={saving}>Next</Button>}
    </Stack>
  </Container>;
}
