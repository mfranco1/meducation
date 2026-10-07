import { Alert, Box, Container } from '@mui/material';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FlashcardCard } from '../../../domain/types';
import type { FlashcardDeckSummary } from '../../../content/api/flashcardApiDecoders';
import type { FlashcardNavigatorFilter } from '../../../domain/flashcardStudy';
import { StudyHeader, StudyNavigationFooter } from '../../../shared/ui/study/StudyHeader';
import { FlashcardNavigator } from '../components/FlashcardNavigator';
import { FlashcardStudyCard } from '../components/FlashcardStudyCard';
import { QuestionNavigationLayout } from '../../../shared/ui/study/QuestionNavigationLayout';

export function FlashcardStudyScreen({ deck, cards, index, revealed, openedCardIds = [], flaggedCardIds = [], saving = false, persistenceError, onReveal, onToggleFlag = () => undefined, onNavigate, onPrevious, onNext, onSaveAndExit, onFinish }: {
  deck: FlashcardDeckSummary;
  cards: readonly FlashcardCard[];
  index: number;
  revealed: boolean;
  openedCardIds?: readonly string[];
  flaggedCardIds?: readonly string[];
  saving?: boolean;
  persistenceError?: string;
  onReveal: () => void;
  onToggleFlag?: (cardId: string) => void;
  onNavigate?: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onSaveAndExit: () => void;
  onFinish: () => void;
}) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [filter, setFilter] = useState<FlashcardNavigatorFilter>('all');
  const nextRef = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<HTMLButtonElement>(null);
  const advanceHadFocus = useRef(false);
  const card = cards[index];
  const last = Boolean(card && index === cards.length - 1);

  useLayoutEffect(() => {
    if (last && advanceHadFocus.current) {
      finishRef.current?.focus();
      advanceHadFocus.current = false;
    }
  }, [index, last]);

  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('button, a, input, textarea, select, [role="button"], [role="dialog"], [aria-modal="true"]'))) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      if (event.repeat) { event.preventDefault(); return; }
      event.preventDefault();
      if (!revealed) {
        onReveal();
      } else if (index < cards.length - 1) {
        advanceHadFocus.current = false;
        onNext();
      }
    };
    window.addEventListener('keydown', handleSpace);
    return () => window.removeEventListener('keydown', handleSpace);
  }, [cards.length, index, onNext, onReveal, revealed]);

  if (!card) return null;
  const navigate = (target: number) => {
    onNavigate?.(target);
    setNavigatorOpen(false);
  };
  return <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
    <Box component="h1" sx={{ position: 'absolute', left: 0, top: 0, width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>{deck.name}</Box>
    {persistenceError && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{persistenceError}</Alert>}
    <StudyHeader itemLabel="Card" index={index} total={cards.length} exitLabel="Save and exit deck" onExit={onSaveAndExit} disabled={saving} />
    <QuestionNavigationLayout navigator={<FlashcardNavigator cards={cards} currentIndex={index} openedCardIds={openedCardIds} flaggedCardIds={flaggedCardIds} filter={filter} onFilterChange={setFilter} onNavigate={navigate} />} open={navigatorOpen} onOpen={() => setNavigatorOpen(true)} onClose={() => setNavigatorOpen(false)} itemLabel="Cards">
      <FlashcardStudyCard card={card} revealed={revealed} flagged={flaggedCardIds.includes(card.id)} onReveal={onReveal} onToggleFlag={() => onToggleFlag(card.id)} />
      <StudyNavigationFooter index={index} total={cards.length} onPrevious={onPrevious} onNext={() => { advanceHadFocus.current = document.activeElement === nextRef.current; onNext(); }} onFinish={onFinish} finishLabel="Finish" disabled={saving} nextButtonRef={nextRef} finishButtonRef={finishRef} />
    </QuestionNavigationLayout>
  </Container>;
}
