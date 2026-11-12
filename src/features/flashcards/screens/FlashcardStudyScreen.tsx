import { Alert, Container } from '@mui/material';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FlashcardCard } from '../../../domain/types';
import type { FlashcardDeckSummary } from '../../../content/api/flashcardApiDecoders';
import type { FlashcardNavigatorFilter } from '../../../domain/flashcardStudy';
import { StudyHeader, StudyNavigationFooter } from '../../../shared/ui/study/StudyHeader';
import { FlashcardNavigator } from '../components/FlashcardNavigator';
import { FlashcardStudyCard } from '../components/FlashcardStudyCard';
import { QuestionNavigationLayout } from '../../../shared/ui/study/QuestionNavigationLayout';
import { SwapTransition } from '../../../shared/ui/transitions/SwapTransition';
import { canHandleStudyShortcut } from '../../../shared/ui/study/studyKeyboard';
import { useStudyArrowNavigation } from '../../../shared/ui/study/useStudyArrowNavigation';

export function FlashcardStudyScreen({
  deck,
  cards,
  index,
  revealed,
  openedCardIds = [],
  flaggedCardIds = [],
  saving = false,
  persistenceError,
  onReveal,
  onToggleFlag = () => undefined,
  onNavigate,
  onPrevious,
  onNext,
  onSaveAndExit,
  onFinish,
  tip,
}: {
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
  /** Shown above the card. */
  tip?: ReactNode;
}) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [suppressCardFocusRing, setSuppressCardFocusRing] = useState(false);
  const [filter, setFilter] = useState<FlashcardNavigatorFilter>('all');
  const [studied, setStudied] = useState<ReadonlySet<string>>(new Set());
  const nextRef = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<HTMLButtonElement>(null);
  const card = cards[index];
  const swipeArea = useRef<HTMLDivElement>(null);
  const arrowNext = useStudyArrowNavigation({
    swipeArea,
    index,
    total: cards.length,
    disabled: saving || !card || navigatorOpen,
    onPrevious,
    onNext,
    nextButtonRef: nextRef,
    finishButtonRef: finishRef,
  });

  const reveal = useCallback(() => {
    if (card && !revealed) setStudied((current) => new Set(current).add(card.id));
    onReveal();
  }, [card, onReveal, revealed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isActivate = event.code === 'Space' || event.key === 'Enter';
      if (!isActivate || !canHandleStudyShortcut(event, 'space') || saving || !card || navigatorOpen) return;
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (!revealed) {
        setSuppressCardFocusRing(true);
        reveal();
      } else if (index < cards.length - 1) {
        setSuppressCardFocusRing(true);
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, cards.length, index, navigatorOpen, onNext, reveal, revealed, saving]);

  if (!card) return null;
  const navigate = (target: number) => {
    onNavigate?.(target);
    setNavigatorOpen(false);
  };
  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
      {persistenceError && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {persistenceError}
        </Alert>
      )}
      <StudyHeader
        title={deck.name}
        itemLabel="Card"
        index={index}
        total={cards.length}
        exitLabel="Save and exit deck"
        completed={cards.filter((item) => openedCardIds.includes(item.id)).length}
        completedLabel="revealed"
        onExit={onSaveAndExit}
        disabled={saving}
      />
      <QuestionNavigationLayout
        navigator={
          <FlashcardNavigator
            cards={cards}
            currentIndex={index}
            openedCardIds={openedCardIds}
            flaggedCardIds={flaggedCardIds}
            filter={filter}
            onFilterChange={setFilter}
            onNavigate={navigate}
          />
        }
        open={navigatorOpen}
        onOpen={() => setNavigatorOpen(true)}
        onClose={() => setNavigatorOpen(false)}
        itemLabel="Cards"
      >
        {tip}
        <SwapTransition swapKey={index} ref={swipeArea}>
          <FlashcardStudyCard
            card={card}
            revealed={revealed}
            flagged={flaggedCardIds.includes(card.id)}
            momentum={studied.size}
            suppressFocusRing={suppressCardFocusRing}
            onSuppressFocusRing={() => setSuppressCardFocusRing(true)}
            onClearFocusRingSuppression={() => setSuppressCardFocusRing(false)}
            onReveal={reveal}
            onToggleFlag={() => onToggleFlag(card.id)}
          />
        </SwapTransition>
        <StudyNavigationFooter
          index={index}
          total={cards.length}
          onPrevious={onPrevious}
          onNext={arrowNext}
          onFinish={onFinish}
          finishLabel="Finish"
          disabled={saving}
          nextButtonRef={nextRef}
          finishButtonRef={finishRef}
        />
      </QuestionNavigationLayout>
    </Container>
  );
}
