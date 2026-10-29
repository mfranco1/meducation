import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Box, Typography } from '@mui/material';
import type { FlashcardCard } from '../../domain/types';
import { FlashcardStudyCard } from '../../features/flashcards/components/FlashcardStudyCard';
import { StudyNavigationFooter } from '../../shared/ui/study/StudyHeader';
import { canHandleStudyShortcut } from '../../shared/ui/study/studyKeyboard';
import { SwapTransition } from '../../shared/ui/transitions/SwapTransition';
import { type } from './typography';
import samples from './samples.json';

const cards = samples.cards.map(({ subject, deck, ...card }) => ({ subject, deck, card: card as FlashcardCard }));

export function SampleFlashcards({ onStart }: { onStart: () => void }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [studied, setStudied] = useState<ReadonlySet<string>>(new Set());
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set());
  const [suppressFocusRing, setSuppressFocusRing] = useState(false);
  const figure = useRef<HTMLElement>(null);
  const refocus = useRef(false);
  const { card, subject, deck } = cards[index]!;

  // Moving on replaces the focused answer panel; keep focus in the figure so its keys keep working.
  useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (!figure.current?.contains(document.activeElement)) figure.current?.querySelector<HTMLElement>('[aria-label="Reveal answer"]')?.focus();
  }, [index]);

  const toggleReveal = () => {
    if (!revealed) setStudied(current => new Set(current).add(card.id));
    setRevealed(!revealed);
  };
  const go = (target: number) => {
    if (target < 0 || target >= cards.length) return;
    refocus.current = Boolean(figure.current?.contains(document.activeElement));
    setIndex(target);
    setRevealed(false);
  };
  const toggleFlag = () => setFlagged(current => {
    const next = new Set(current);
    if (!next.delete(card.id)) next.add(card.id);
    return next;
  });
  // The same keys as a deck in the app, kept to this figure so they never act on the rest of the page.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    const native = event.nativeEvent;
    if ((event.code === 'Space' || event.key === 'Enter') && canHandleStudyShortcut(native, 'space')) {
      event.preventDefault();
      setSuppressFocusRing(true);
      if (!revealed) toggleReveal();
      else go(index + 1);
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && canHandleStudyShortcut(native, 'arrow')) {
      event.preventDefault();
      go(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  };

  return <Box component="figure" ref={figure} aria-labelledby="sample-card-caption" onKeyDown={onKeyDown} sx={{ m: 0 }}>
    <SwapTransition swapKey={index}>
      <FlashcardStudyCard
        card={card}
        revealed={revealed}
        flagged={flagged.has(card.id)}
        momentum={studied.size}
        suppressFocusRing={suppressFocusRing}
        onSuppressFocusRing={() => setSuppressFocusRing(true)}
        onClearFocusRingSuppression={() => setSuppressFocusRing(false)}
        onReveal={toggleReveal}
        onToggleFlag={toggleFlag}
      />
    </SwapTransition>
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: { xs: 0, sm: 3 } }}>
      <Typography component="figcaption" id="sample-card-caption" sx={{ ...type.caption, mt: 3, order: { xs: 2, sm: 0 } }}>
        <Box component="b" sx={{ color: 'text.primary' }}>Fig. 1</Box> Card {index + 1} of {cards.length}. {subject} · {deck}.
      </Typography>
      <StudyNavigationFooter index={index} total={cards.length} onPrevious={() => go(index - 1)} onNext={() => go(index + 1)} onFinish={onStart} finishLabel="Start studying" />
    </Box>
  </Box>;
}
