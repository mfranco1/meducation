import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { FlashcardCard } from '../../domain/types';
import { FlashcardStudyCard } from '../../features/flashcards/components/FlashcardStudyCard';
import { StudyNavigationFooter } from '../../shared/ui/study/StudyHeader';
import { StudyNavigatorTile } from '../../shared/ui/study/StudyNavigatorTile';
import { canHandleStudyShortcut } from '../../shared/ui/study/studyKeyboard';
import { useStudyArrowNavigation } from '../../shared/ui/study/useStudyArrowNavigation';
import { SwapTransition } from '../../shared/ui/transitions/SwapTransition';
import { SampleHeader } from './SampleHeader';
import { useSampleActive } from './useSampleActive';
import samples from './samples.json';

const cards = samples.cards.map(({ subject, deck, ...card }) => ({ subject, deck, card: card as FlashcardCard }));

export function SampleFlashcards({ onStart }: { onStart: () => void }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [studied, setStudied] = useState<ReadonlySet<string>>(new Set());
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set());
  const [suppressFocusRing, setSuppressFocusRing] = useState(false);
  const region = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<HTMLButtonElement>(null);
  const active = useSampleActive(region);
  const { card, subject, deck } = cards[index]!;

  const toggleReveal = () => {
    if (!revealed) setStudied(current => new Set(current).add(card.id));
    setRevealed(!revealed);
  };
  const go = (target: number) => {
    if (target < 0 || target >= cards.length) return;
    setIndex(target);
    setRevealed(false);
  };
  const toggleFlag = () => setFlagged(current => {
    const next = new Set(current);
    if (!next.delete(card.id)) next.add(card.id);
    return next;
  });
  useStudyArrowNavigation({ index, total: cards.length, disabled: !active, onPrevious: () => go(index - 1), onNext: () => go(index + 1), nextButtonRef: nextRef, finishButtonRef: finishRef });

  // The same Space and Enter behavior as a deck in the app, while this sample is active.
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.code !== 'Space' && event.key !== 'Enter') || !canHandleStudyShortcut(event, 'space')) return;
      event.preventDefault();
      if (event.repeat) return;
      if (!revealed) {
        setSuppressFocusRing(true);
        toggleReveal();
      } else if (index < cards.length - 1) {
        setSuppressFocusRing(true);
        go(index + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return <Box component="section" ref={region} aria-labelledby="sample-card-label">
    <SampleHeader id="sample-card-label" title={`Card ${index + 1} of ${cards.length}`} detail={`${subject} · ${deck}`} navLabel="Cards" stacked>
      {cards.map((item, position) => {
        const opened = studied.has(item.card.id);
        const isFlagged = flagged.has(item.card.id);
        return <StudyNavigatorTile key={item.card.id} number={position + 1} label="Card" current={position === index} highlighted={opened} flagged={isFlagged} status={[opened ? 'opened' : 'unopened', isFlagged ? 'flagged' : undefined].filter(Boolean).join(', ')} onClick={() => go(position)} />;
      })}
    </SampleHeader>
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
    <StudyNavigationFooter index={index} total={cards.length} onPrevious={() => go(index - 1)} onNext={() => go(index + 1)} onFinish={onStart} finishLabel="Start studying" nextButtonRef={nextRef} finishButtonRef={finishRef} />
  </Box>;
}
