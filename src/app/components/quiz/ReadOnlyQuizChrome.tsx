import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { Stack, Typography } from '@mui/material';
import { formatDuration } from '../../format';
import { StudyHeader, StudyNavigationFooter } from '../study/StudyHeader';

export function ReadOnlyQuizHeader({ index, total, mode, exitLabel, onExit, finalTimeMs }: {
  index: number;
  total: number;
  mode?: 'Browse answers' | 'Review results';
  exitLabel: string;
  onExit: () => void;
  finalTimeMs?: number;
}) {
  return <StudyHeader itemLabel="Question" index={index} total={total} exitLabel={exitLabel} onExit={onExit} countLabel={`${mode ?? 'Review'}, question ${index + 1} of ${total}`} trailing={finalTimeMs !== undefined ? <Stack direction="row" spacing={.75} alignItems="center" aria-label={`Final time: ${formatDuration(finalTimeMs)}`}>
        <TimerOutlinedIcon fontSize="small" aria-hidden="true" />
        <Typography fontWeight={700}>{formatDuration(finalTimeMs)}</Typography>
      </Stack> : undefined} />;
}

export function ReadOnlyQuizFooter({ index, total, onNavigate, onDone }: {
  index: number;
  total: number;
  onNavigate: (index: number) => void;
  onDone: () => void;
}) {
  return <StudyNavigationFooter index={index} total={total} onPrevious={() => onNavigate(index - 1)} onNext={() => onNavigate(index + 1)} onFinish={onDone} finishLabel="Done" />;
}
