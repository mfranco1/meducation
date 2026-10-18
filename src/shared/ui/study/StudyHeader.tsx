import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { keyframes } from '@emotion/react';
import { alpha, Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { useState, type MutableRefObject, type ReactNode } from 'react';

const fillTransition = '450ms cubic-bezier(0.22, 1, 0.36, 1)';
const reducedMotion = '@media (prefers-reduced-motion: reduce)';
const glint = keyframes`
  from { opacity: 0; transform: translateX(-28px); }
  35% { opacity: 1; }
  to { opacity: 0; transform: translateX(0); }
`;
const pulse = keyframes`
  from { opacity: 0; transform: translate(-50%, -50%) scale(1); }
  10% { opacity: .6; }
  to { opacity: 0; transform: translate(-50%, -50%) scale(2.6); }
`;

/** `completed` counts finished items (answered questions, revealed cards); without it the bar shows position only. */
export function StudyHeader({ itemLabel, index, total, exitLabel, onExit, disabled = false, trailing, countLabel, completed, completedLabel = 'answered' }: {
  itemLabel: string; index: number; total: number; exitLabel: string; onExit: () => void; disabled?: boolean; trailing?: ReactNode; countLabel?: string; completed?: number; completedLabel?: string;
}) {
  return <>
    <IconButton aria-label={exitLabel} onClick={onExit} disabled={disabled} sx={{ p: .5, mb: .5 }}><ArrowBackRoundedIcon /></IconButton>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary" aria-label={countLabel ?? `${itemLabel} ${index + 1} of ${total}`}>{itemLabel} {index + 1} of {total}</Typography>
      {trailing}
    </Stack>
    <StudyProgress itemLabel={itemLabel} index={index} total={total} completed={completed} completedLabel={completedLabel} />
  </>;
}

function StudyProgress({ itemLabel, index, total, completed, completedLabel }: { itemLabel: string; index: number; total: number; completed?: number; completedLabel: string }) {
  const [seen, setSeen] = useState(completed);
  const [flourish, setFlourish] = useState<{ id: number; milestone: boolean }>();
  if (completed !== seen) {
    setSeen(completed);
    if (completed !== undefined && seen !== undefined && completed > seen) {
      setFlourish({ id: completed, milestone: Math.floor(completed * 4 / total) > Math.floor(seen * 4 / total) });
    }
  }
  const position = (index + 1) / total * 100;
  const done = completed === undefined ? position : completed / total * 100;
  const band = { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 5, transition: `width ${fillTransition}`, [reducedMotion]: { transition: 'none' } } as const;
  const value = completed ?? index + 1;

  return <Box
    role="progressbar"
    aria-label={completed === undefined ? `${itemLabel} position` : `${itemLabel}s ${completedLabel}`}
    aria-valuemin={0}
    aria-valuemax={total}
    aria-valuenow={value}
    aria-valuetext={completed === undefined ? `${itemLabel} ${index + 1} of ${total}` : `${completed} of ${total} ${completedLabel}`}
    sx={{ position: 'relative', mt: 1.5, height: 7, borderRadius: 5, bgcolor: theme => alpha(theme.palette.primary.main, .12) }}
  >
    {completed !== undefined && <Box sx={{ ...band, width: `${position}%`, bgcolor: theme => alpha(theme.palette.primary.main, .3) }} />}
    <Box sx={{ ...band, width: `${done}%`, overflow: 'hidden', bgcolor: 'primary.main' }}>
      {flourish && <Box key={flourish.id} aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 24, borderRadius: '0 5px 5px 0', background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, .85))', animation: `${glint} 650ms ease-out both`, [reducedMotion]: { display: 'none' } }} />}
    </Box>
    {flourish?.milestone && <Box key={flourish.id} aria-hidden sx={{ position: 'absolute', top: '50%', left: `${done}%`, width: 9, height: 9, borderRadius: '50%', bgcolor: 'primary.main', animation: `${pulse} 700ms ease-out 200ms both`, [reducedMotion]: { display: 'none' } }} />}
  </Box>;
}

export function StudyNavigationFooter({ index, total, onPrevious, onNext, onFinish, finishLabel, nextLabel = 'Next', disabled = false, nextButtonRef, finishButtonRef }: {
  index: number; total: number; onPrevious: () => void; onNext: () => void; onFinish: () => void; finishLabel: string; nextLabel?: string; disabled?: boolean; nextButtonRef?: MutableRefObject<HTMLButtonElement | null>; finishButtonRef?: MutableRefObject<HTMLButtonElement | null>;
}) {
  return <Stack direction="row" justifyContent="flex-end" alignItems="center" sx={{ mt: 3 }}><Stack direction="row" spacing={1}>
    <Button startIcon={<ArrowBackRoundedIcon />} disabled={index === 0 || disabled} onClick={onPrevious}>Previous</Button>
    {index === total - 1
      ? <Button ref={finishButtonRef} variant="contained" disabled={disabled} onClick={onFinish}>{finishLabel}</Button>
      : <Button ref={nextButtonRef} endIcon={<ArrowForwardRoundedIcon />} disabled={disabled} onClick={onNext}>{nextLabel}</Button>}
  </Stack></Stack>;
}
