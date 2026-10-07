import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Button, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import type { MutableRefObject, ReactNode } from 'react';

export function StudyHeader({ itemLabel, index, total, exitLabel, onExit, disabled = false, trailing, countLabel }: {
  itemLabel: string; index: number; total: number; exitLabel: string; onExit: () => void; disabled?: boolean; trailing?: ReactNode; countLabel?: string;
}) {
  return <>
    <IconButton aria-label={exitLabel} onClick={onExit} disabled={disabled} sx={{ p: .5, mb: .5 }}><ArrowBackRoundedIcon /></IconButton>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary" aria-label={countLabel ?? `${itemLabel} ${index + 1} of ${total}`}>{itemLabel} {index + 1} of {total}</Typography>
      {trailing}
    </Stack>
    <LinearProgress variant="determinate" value={(index + 1) / total * 100} sx={{ mt: 1.5, height: 7, borderRadius: 5 }} />
  </>;
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
