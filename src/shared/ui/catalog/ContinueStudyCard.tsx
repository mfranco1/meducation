import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Box, CardActionArea, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useId, type ReactNode } from 'react';
import { reducedMotion } from '../motion';
import { focusRingInset, radius } from '../../theme';
import { ProgressTrack } from './SubjectProgressSummary';

export const continueCardBackground = ({ palette }: Theme) =>
  `linear-gradient(110deg, ${palette.background.default} 0%, ${palette.background.paper} 58%, ${palette.primary.light} 100%)`;

/** Whole-number share of items completed; any completion shows at least 1% so it never reads as zero. */
export function completedPercent(completed: number, total: number) {
  return completed > 0 && total > 0 ? Math.max(1, Math.round((completed / total) * 100)) : 0;
}

/** The Continue Studying progress line, such as "12 of 40 quizzes completed". */
export function completionProgress(completed: number, total: number, unit: 'quiz' | 'deck') {
  const plural = unit === 'quiz' ? 'quizzes' : 'decks';
  return {
    percent: completedPercent(completed, total),
    label: `${completed} of ${total} ${total === 1 ? unit : plural} completed`,
  };
}

export type ContinueStudyCardProps = {
  title: string;
  activityLabel: string;
  onContinue: () => void;
  actionLabel?: string;
  accessibleLabel: string;
  eyebrow?: string;
  illustration: ReactNode;
  /** Share of the subject completed, shown as a bar with its label. */
  progress?: { percent: number; label: string };
  sx?: SxProps<Theme>;
};

export function ContinueStudyCard({
  title,
  activityLabel,
  onContinue,
  actionLabel = 'Continue',
  accessibleLabel,
  eyebrow = 'Continue Studying',
  illustration,
  progress,
  sx,
}: ContinueStudyCardProps) {
  const activityId = useId();
  const progressId = useId();
  const customSx = sx === undefined ? [] : Array.isArray(sx) ? sx : [sx];

  return (
    <Box
      sx={[
        {
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: radius.feature,
          boxSizing: 'border-box',
          containerName: 'continue-card',
          containerType: 'inline-size',
          height: '100%',
          isolation: 'isolate',
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
          background: continueCardBackground,
          '& .continue-study-action': { minHeight: 152, pl: '24px', pr: '40px', py: '16px' },
          '@container continue-card (max-width: 297px)': {
            '& .continue-study-action': { pl: '16px', pr: '32px', py: '12px' },
          },
          '@container continue-card (min-width: 478px)': {
            '& .continue-study-action': { minHeight: 156, px: '24px', py: '16px' },
          },
          '@container continue-card (min-width: 638px)': {
            '& .continue-study-action': { minHeight: 160, px: '32px', py: '20px' },
          },
        },
        ...customSx,
      ]}
    >
      <Box
        aria-hidden="true"
        sx={{
          bottom: 0,
          contain: 'paint',
          height: '100%',
          pointerEvents: 'none',
          position: 'absolute',
          right: 0,
          top: 0,
          width: '48%',
          zIndex: 0,
          '& svg, & img': { display: 'block', height: '100%', width: '100%' },
          '@container continue-card (min-width: 478px) and (max-width: 637px)': { width: '44%' },
          '@container continue-card (max-width: 477px)': { opacity: 0.22, width: 145 },
        }}
      >
        {illustration}
      </Box>

      <CardActionArea
        className="continue-study-action"
        data-testid="continue-study-card"
        component="button"
        type="button"
        aria-label={accessibleLabel}
        aria-describedby={progress ? `${activityId} ${progressId}` : activityId}
        onClick={() => onContinue()}
        sx={{
          alignItems: 'stretch',
          boxSizing: 'border-box',
          color: 'inherit',
          display: 'flex',
          height: '100%',
          justifyContent: 'flex-start',
          minWidth: 0,
          position: 'relative',
          textAlign: 'left',
          width: '100%',
          zIndex: 1,
          '&.Mui-focusVisible': {
            ...focusRingInset,
            borderRadius: 'inherit',
          },
          '&:hover .continue-study-cta': { filter: 'brightness(.96)' },
          '@container continue-card (min-width: 638px)': { '& .continue-study-copy': { width: '55%' } },
          '@container continue-card (min-width: 478px) and (max-width: 637px)': {
            '& .continue-study-copy': { width: '58%' },
          },
          '@container continue-card (max-width: 477px)': {
            '& .continue-study-copy': { width: '100%' },
          },
        }}
      >
        <Box className="continue-study-copy" sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" component="span" sx={{ color: 'text.primary', display: 'block' }}>
            {eyebrow}
          </Typography>
          <Typography
            variant="h5"
            component="span"
            sx={{ color: 'text.primary', display: 'block', mt: '4px', overflowWrap: 'anywhere' }}
          >
            {title}
          </Typography>
          <Typography
            id={activityId}
            variant="body2"
            component="span"
            sx={{ color: 'text.secondary', display: 'block', mt: '2px' }}
          >
            {activityLabel}
          </Typography>
          {progress && (
            <Box
              component="span"
              sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '4px 10px', mt: '10px' }}
            >
              <ProgressTrack percent={progress.percent} sx={{ flexShrink: 0, width: 120 }} />
              <Typography id={progressId} variant="caption" component="span" sx={{ color: 'text.secondary' }}>
                {progress.label}
              </Typography>
            </Box>
          )}
          <Box
            component="span"
            className="continue-study-cta"
            sx={{
              alignItems: 'center',
              bgcolor: 'primary.main',
              borderRadius: radius.control,
              color: 'primary.contrastText',
              display: 'inline-flex',
              typography: 'subtitle1',
              gap: '8px',
              minHeight: 42,
              mt: '16px',
              px: '22px',
              transition: 'filter 120ms ease',
              [reducedMotion]: { transition: 'none' },
            }}
          >
            {actionLabel}
            <ArrowForwardRounded aria-hidden="true" focusable="false" sx={{ fontSize: 20 }} />
          </Box>
        </Box>
      </CardActionArea>
    </Box>
  );
}
