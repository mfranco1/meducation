import FlagIcon from '@mui/icons-material/Flag';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { Box, ButtonBase, Card, CardContent, IconButton } from '@mui/material';
import { useLayoutEffect, useRef } from 'react';
import type { FlashcardCard } from '../../../domain/types';
import { MarkdownContent } from '../content/MarkdownContent';

export function FlashcardStudyCard({ card, revealed, flagged, onReveal, onToggleFlag }: {
  card: FlashcardCard; revealed: boolean; flagged: boolean; onReveal: () => void; onToggleFlag: () => void;
}) {
  const revealButton = useRef<HTMLButtonElement>(null);
  const answerPanel = useRef<HTMLDivElement>(null);
  const previous = useRef({ cardId: card.id, revealed });
  useLayoutEffect(() => {
    if (previous.current.cardId === card.id && previous.current.revealed !== revealed) {
      if (revealed) answerPanel.current?.focus();
      else revealButton.current?.focus();
    }
    previous.current = { cardId: card.id, revealed };
  }, [revealed, card.id]);

  return <Card variant="outlined" sx={{ minHeight: { xs: 390, sm: 460 }, display: 'flex', overflow: 'visible' }}>
    <CardContent sx={{ p: { xs: 2.5, sm: 4 }, width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', flex: 1, minHeight: 145, px: { xs: 2, sm: 4 }, py: 3 }}>
        <IconButton aria-label={flagged ? 'Remove card flag' : 'Flag card'} aria-pressed={flagged} onClick={onToggleFlag} sx={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
          {flagged ? <FlagIcon color="primary" /> : <FlagOutlinedIcon />}
        </IconButton>
        <Box aria-live="polite" sx={{ width: '100%', textAlign: 'center', '& .katex-display': { maxWidth: '100%' } }}>
          <MarkdownContent markdown={card.front} variant="stem" contentKind="rich" align="center" />
        </Box>
      </Box>

      <Box sx={{ perspective: 1200, width: '100%' }}>
        <Box key={card.id} role="group" aria-label={revealed ? 'Flashcard answer' : 'Hidden flashcard answer'} aria-live="polite" sx={{ display: 'grid', transformStyle: 'preserve-3d', transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)', transition: 'transform 320ms cubic-bezier(.2, .7, .2, 1)', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
          <ButtonBase ref={revealButton} onClick={onReveal} aria-label="Reveal answer" aria-hidden={revealed} tabIndex={revealed ? -1 : 0} sx={{ gridArea: '1 / 1', zIndex: revealed ? 0 : 1, minHeight: 190, p: 3, borderRadius: 1, bgcolor: 'primary.main', color: '#fff', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', '&:hover': { bgcolor: 'primary.dark' }, '&:focus-visible': { outline: '3px solid', outlineColor: 'text.primary', outlineOffset: 3 } }}>
            <MenuBookRoundedIcon aria-hidden="true" sx={{ fontSize: { xs: 72, sm: 88 }, color: 'common.white' }} />
          </ButtonBase>
          <Box ref={answerPanel} role="group" aria-label="Answer revealed. Click to hide or press Space to continue." tabIndex={revealed ? 0 : -1} aria-hidden={!revealed} inert={!revealed} onClick={event => {
            const target = event.target as HTMLElement;
            if (target.closest('a, button, input, textarea, select, [role="button"]') || window.getSelection()?.toString()) return;
            onReveal();
          }} sx={{ gridArea: '1 / 1', transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', minHeight: 190, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 2, p: { xs: 2.5, sm: 3 }, borderRadius: 1, bgcolor: 'primary.main', color: '#fff', textAlign: 'center', cursor: revealed ? 'pointer' : 'default', '&:focus-visible': { outline: '3px solid', outlineColor: 'text.primary', outlineOffset: 3 }, '& a': { color: 'inherit' }, '& img': { marginInline: 'auto' } }}>
            <Box sx={{ width: '100%', textAlign: 'center', '& .katex-display': { maxWidth: '100%', textAlign: 'center' }, '& ul, & ol': { display: 'inline-block', textAlign: 'left' }, '& table': { marginInline: 'auto' } }}>
              <MarkdownContent markdown={card.back} variant="explanation" contentKind="rich" align="center" fontWeight={700} />
            </Box>
            {card.sources && <Box sx={{ width: '100%', color: 'inherit', opacity: .85, '& a': { color: 'inherit' } }}><strong>Source: </strong><MarkdownContent markdown={card.sources} variant="inline" /></Box>}
          </Box>
        </Box>
      </Box>
    </CardContent>
  </Card>;
}
