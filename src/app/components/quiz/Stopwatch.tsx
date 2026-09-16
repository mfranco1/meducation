import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { elapsedTimeFor } from '../../../domain/quizEngine';
import type { Attempt } from '../../../domain/types';
import { formatDuration } from '../../format';

export function Stopwatch({ attempt }: { attempt: Attempt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return <Stack direction="row" spacing={.75} alignItems="center">
    <TimerOutlinedIcon fontSize="small" />
    <Typography fontWeight={700}>{formatDuration(elapsedTimeFor(attempt, now))}</Typography>
  </Stack>;
}
