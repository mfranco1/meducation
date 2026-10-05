import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { Button, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import { formatDuration } from '../../format';

export function ReadOnlyQuizHeader({ index, total, mode, exitLabel, onExit, finalTimeMs }: {
  index: number;
  total: number;
  mode: 'Browse answers' | 'Review results';
  exitLabel: string;
  onExit: () => void;
  finalTimeMs?: number;
}) {
  return <>
    <IconButton aria-label={exitLabel} onClick={onExit} sx={{ p: .5, mb: .5 }}><ArrowBackRoundedIcon /></IconButton>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary" aria-label={`${mode}, question ${index + 1} of ${total}`}>Question {index + 1} of {total}</Typography>
      {finalTimeMs !== undefined && <Stack direction="row" spacing={.75} alignItems="center" aria-label={`Final time: ${formatDuration(finalTimeMs)}`}>
        <TimerOutlinedIcon fontSize="small" aria-hidden="true" />
        <Typography fontWeight={700}>{formatDuration(finalTimeMs)}</Typography>
      </Stack>}
    </Stack>
    <LinearProgress variant="determinate" value={(index + 1) / total * 100} sx={{ mt: 1.5, height: 7, borderRadius: 5 }} />
  </>;
}

export function ReadOnlyQuizFooter({ index, total, onNavigate, onDone }: {
  index: number;
  total: number;
  onNavigate: (index: number) => void;
  onDone: () => void;
}) {
  return <Stack direction="row" justifyContent="flex-end" alignItems="center" sx={{ mt: 3 }}><Stack direction="row" spacing={1}>
    <Button startIcon={<ArrowBackRoundedIcon />} disabled={index === 0} onClick={() => onNavigate(index - 1)}>Previous</Button>
    {index === total - 1
      ? <Button variant="contained" onClick={onDone}>Done</Button>
      : <Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => onNavigate(index + 1)}>Next</Button>}
  </Stack></Stack>;
}
