import FlagIcon from '@mui/icons-material/Flag';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { Box, ButtonBase, Card, CardContent, IconButton } from '@mui/material';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { FlashcardCard } from '../../../domain/types';
import { MarkdownContent } from '../../../shared/ui/content/MarkdownContent';
import { BrandMark } from '../../../shared/ui/brand/BrandMark';
import { FlashcardFaceDecoration } from './FlashcardFaceDecoration';

const cardThickness =
  'inset 0 1px 0 rgba(255,255,255,.9), 0 1px 0 rgba(118,106,99,.06), 0 3px 8px rgba(57,38,22,.045), 0 8px 16px rgba(57,38,22,.04)';

const frameRadiusStyles = {
  '--flashcard-frame-radius': { xs: '18px', sm: '26px' },
  '--flashcard-frame-margin': { xs: '12px', sm: '16px' },
  '--flashcard-line-inset': 'calc(var(--flashcard-frame-margin) * 0.28125)',
  '--flashcard-line-radius': 'calc(var(--flashcard-frame-radius) + var(--flashcard-line-inset))',
};

export function FlashcardStudyCard({
  card,
  revealed,
  flagged,
  suppressFocusRing,
  onSuppressFocusRing,
  onClearFocusRingSuppression,
  onReveal,
  onToggleFlag,
}: {
  card: FlashcardCard;
  revealed: boolean;
  flagged: boolean;
  suppressFocusRing: boolean;
  onSuppressFocusRing: () => void;
  onClearFocusRingSuppression: () => void;
  onReveal: () => void;
  onToggleFlag: () => void;
}) {
  const revealButton = useRef<HTMLButtonElement>(null);
  const answerPanel = useRef<HTMLDivElement>(null);
  const [frontFace, setFrontFace] = useState<HTMLButtonElement | null>(null);
  const [backFace, setBackFace] = useState<HTMLDivElement | null>(null);
  const setFrontFaceRef = useCallback((node: HTMLButtonElement | null) => {
    revealButton.current = node;
    setFrontFace((current) => (current === node ? current : node));
  }, []);
  const setBackFaceRef = useCallback((node: HTMLDivElement | null) => {
    answerPanel.current = node;
    setBackFace((current) => (current === node ? current : node));
  }, []);
  const previous = useRef({ cardId: card.id, revealed });
  useLayoutEffect(() => {
    if (previous.current.cardId === card.id && previous.current.revealed !== revealed) {
      if (revealed) answerPanel.current?.focus();
      else revealButton.current?.focus();
    }
    previous.current = { cardId: card.id, revealed };
  }, [revealed, card.id]);

  return (
    <Card variant="outlined" sx={{ minHeight: { xs: 390, sm: 460 }, display: 'flex', overflow: 'visible' }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 4 }, width: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            position: 'relative',
            display: 'grid',
            placeItems: 'center',
            flex: 1,
            minHeight: 145,
            px: { xs: 2, sm: 4 },
            py: 3,
          }}
        >
          <IconButton
            disableRipple
            aria-label={flagged ? 'Remove card flag' : 'Flag card'}
            aria-pressed={flagged}
            onClick={onToggleFlag}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              zIndex: 1,
              bgcolor: 'transparent',
              '&:hover': { bgcolor: 'transparent' },
              '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            {flagged ? <FlagIcon color="primary" /> : <FlagOutlinedIcon />}
          </IconButton>
          <Box aria-live="polite" sx={{ width: '100%', textAlign: 'center', '& .katex-display': { maxWidth: '100%' } }}>
            <MarkdownContent markdown={card.front} variant="stem" contentKind="rich" align="center" />
          </Box>
        </Box>

        <Box
          data-space-nav-focus-ring={suppressFocusRing ? 'suppressed' : undefined}
          onKeyDownCapture={(event) => {
            if (event.key === 'Tab') onClearFocusRingSuppression();
          }}
          onPointerDownCapture={onClearFocusRingSuppression}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              onClearFocusRingSuppression();
            }
          }}
          sx={{
            perspective: '1200px',
            perspectiveOrigin: '50% 50%',
            width: '100%',
            '@media (prefers-reduced-motion: reduce)': { perspective: 'none' },
          }}
        >
          <Box
            sx={{
              transform: 'translateY(0)',
              transformStyle: 'preserve-3d',
              transition: 'transform 180ms cubic-bezier(.2, 0, 0, 1)',
              '@media (hover: hover) and (pointer: fine)': { '&:hover': { transform: 'translateY(-3px)' } },
              '@media (prefers-reduced-motion: reduce)': { transform: 'none', transition: 'none' },
            }}
          >
            <Box
              key={card.id}
              role="group"
              aria-label={revealed ? 'Flashcard answer' : 'Hidden flashcard answer'}
              aria-live="polite"
              sx={{
                display: 'grid',
                transformStyle: 'preserve-3d',
                transformOrigin: '50% 50%',
                transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
                transition: 'transform 420ms cubic-bezier(.22, .61, .36, 1)',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <ButtonBase
                ref={setFrontFaceRef}
                disableRipple
                onClick={onReveal}
                onKeyDown={(event) => {
                  if (event.code === 'Space' && !event.repeat) onSuppressFocusRing();
                }}
                aria-label="Reveal answer"
                aria-hidden={revealed}
                tabIndex={revealed ? -1 : 0}
                sx={{
                  gridArea: '1 / 1',
                  zIndex: revealed ? 0 : 1,
                  position: 'relative',
                  overflow: 'visible',
                  boxSizing: 'border-box',
                  minHeight: { xs: '220px', sm: '280px' },
                  p: { xs: '40px 32px', sm: '52px 48px' },
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: { xs: '22px', sm: '28px' },
                  ...frameRadiusStyles,
                  bgcolor: 'background.paper',
                  color: '#fff',
                  boxShadow: cardThickness,
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  '&:hover': { bgcolor: 'background.paper' },
                  '&:focus-visible': suppressFocusRing
                    ? { outline: 'none' }
                    : { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 3 },
                }}
              >
                <FlashcardFaceDecoration element={frontFace} />
                <Box
                  sx={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'grid',
                    placeItems: 'center',
                    width: '100%',
                    height: '100%',
                  }}
                >
                  <BrandMark colorMode="white" decorative size={{ xs: 72, sm: 104 }} />
                </Box>
              </ButtonBase>
              <Box
                ref={setBackFaceRef}
                role="group"
                aria-label="Answer revealed. Click to hide or press Space to continue."
                tabIndex={revealed ? 0 : -1}
                aria-hidden={!revealed}
                inert={!revealed}
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (
                    target.closest('a, button, input, textarea, select, [role="button"]') ||
                    window.getSelection()?.toString()
                  )
                    return;
                  onReveal();
                }}
                sx={{
                  gridArea: '1 / 1',
                  transform: 'rotateY(180deg)',
                  position: 'relative',
                  overflow: 'visible',
                  boxSizing: 'border-box',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  minHeight: { xs: '220px', sm: '280px' },
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 2,
                  p: { xs: '40px 32px', sm: '52px 48px' },
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: { xs: '22px', sm: '28px' },
                  ...frameRadiusStyles,
                  bgcolor: 'background.paper',
                  boxShadow: cardThickness,
                  color: '#fff',
                  textAlign: 'center',
                  cursor: revealed ? 'pointer' : 'default',
                  '&:focus-visible': suppressFocusRing
                    ? { outline: 'none' }
                    : { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 3 },
                  '& a': { color: 'inherit' },
                  '& img': { marginInline: 'auto' },
                }}
              >
                <FlashcardFaceDecoration element={backFace} />
                <Box
                  sx={{
                    position: 'relative',
                    zIndex: 1,
                    width: '100%',
                    minWidth: 0,
                    textAlign: 'center',
                    '& .katex-display': { maxWidth: '100%', textAlign: 'center' },
                    '& ul, & ol': { display: 'inline-block', textAlign: 'left' },
                    '& table': { marginInline: 'auto' },
                  }}
                >
                  <MarkdownContent
                    markdown={card.back}
                    variant="explanation"
                    contentKind="rich"
                    align="center"
                    fontWeight={700}
                  />
                </Box>
                {card.sources && (
                  <Box sx={{ width: '100%', color: 'inherit', opacity: 0.85, '& a': { color: 'inherit' } }}>
                    <strong>Source: </strong>
                    <MarkdownContent markdown={card.sources} variant="inline" />
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
