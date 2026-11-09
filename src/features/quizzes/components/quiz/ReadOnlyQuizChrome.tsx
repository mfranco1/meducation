import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { Stack, Typography } from '@mui/material';
import { formatDuration } from '../../format';
import { StudyHeader, StudyNavigationFooter } from '../../../../shared/ui/study/StudyHeader';
import type { MutableRefObject } from 'react';

export function ReadOnlyQuizHeader({
  index,
  total,
  mode,
  exitLabel,
  onExit,
  finalTimeMs,
}: {
  index: number;
  total: number;
  mode?: 'Browse answers' | 'Review results';
  exitLabel: string;
  onExit: () => void;
  finalTimeMs?: number;
}) {
  return (
    <StudyHeader
      itemLabel="Question"
      index={index}
      total={total}
      exitLabel={exitLabel}
      onExit={onExit}
      countLabel={`${mode ?? 'Review'}, question ${index + 1} of ${total}`}
      trailing={
        finalTimeMs !== undefined ? (
          <Stack
            direction="row"
            spacing={1}
            aria-label={`Final time: ${formatDuration(finalTimeMs)}`}
            sx={{ alignItems: 'center' }}
          >
            <TimerOutlinedIcon fontSize="small" aria-hidden="true" />
            <Typography sx={{ fontWeight: 700 }}>{formatDuration(finalTimeMs)}</Typography>
          </Stack>
        ) : undefined
      }
    />
  );
}

export function ReadOnlyQuizFooter({
  index,
  total,
  previousIndex = index > 0 ? index - 1 : undefined,
  nextIndex = index < total - 1 ? index + 1 : undefined,
  onNavigate,
  onDone,
  nextButtonRef,
  finishButtonRef,
}: {
  index: number;
  total: number;
  previousIndex?: number;
  nextIndex?: number;
  onNavigate: (index: number) => void;
  onDone: () => void;
  nextButtonRef?: MutableRefObject<HTMLButtonElement | null>;
  finishButtonRef?: MutableRefObject<HTMLButtonElement | null>;
}) {
  return (
    <StudyNavigationFooter
      index={index}
      total={total}
      hasPrevious={previousIndex !== undefined}
      hasNext={nextIndex !== undefined}
      onPrevious={() => previousIndex !== undefined && onNavigate(previousIndex)}
      onNext={() => nextIndex !== undefined && onNavigate(nextIndex)}
      onFinish={onDone}
      finishLabel="Done"
      nextButtonRef={nextButtonRef}
      finishButtonRef={finishButtonRef}
    />
  );
}
