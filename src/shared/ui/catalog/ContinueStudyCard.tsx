import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Box, CardActionArea, Typography } from '@mui/material';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
import { useId, type ReactNode } from 'react';
import { reducedMotion } from '../motion';
import { focusRingInset, radius, shadow } from '../../theme';
import { ProgressTrack } from './SubjectProgressSummary';

/** The wide dashboard hero, where the card stands tall beside the stats. */
export const tallHero = '@container study-hero (min-width: 960px)';

export const continueCardBackground = ({ palette }: Theme) =>
  `linear-gradient(110deg, ${palette.background.paper} 0%, ${alpha(palette.primary.light, 0.5)} 45%, ${palette.primary.light} 100%), ${palette.background.paper}`;

/** Warms the artwork toward the brand orange. */
const artworkTint = 'sepia(.15) saturate(1.3)';

/** In a carousel, how far the card sits from the center: 0 centered, 1 peeking (see StudyItemCarousel). */
const peek = 'var(--carousel-peek, 0)';

/** Whole-number share of items completed; any completion shows at least 1% so it never reads as zero. */
export function completedPercent(completed: number, total: number) {
  return completed > 0 && total > 0 ? Math.max(1, Math.round((completed / total) * 100)) : 0;
}

/**
 * Progress in a subject's most recently active quiz or deck, such as "12 of 40 questions answered".
 * `total` is unknown until the subject's catalog loads.
 */
export function latestActiveProgress(done: number, total: number | undefined, unit: 'question' | 'card') {
  const noun = (total ?? done) === 1 ? unit : `${unit}s`;
  const verb = unit === 'question' ? 'answered' : 'revealed';
  return total === undefined
    ? { label: `${done} ${noun} ${verb}` }
    : { percent: completedPercent(done, total), label: `${done} of ${total} ${noun} ${verb}` };
}

export type ContinueStudyCardProps = {
  title: string;
  activityLabel: string;
  onContinue: () => void;
  actionLabel?: string;
  accessibleLabel: string;
  eyebrow?: string;
  illustration: ReactNode;
  /** Study progress as a label and a bar, which fills once the share done is known. */
  progress?: { percent?: number; label: string };
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
          border: '2px solid',
          borderColor: 'common.white',
          borderRadius: radius.feature,
          boxShadow: shadow.overlay,
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
          // Tall beside the stats in the wide dashboard hero (see StudyDashboardLayout).
          [tallHero]: { '& .continue-study-action': { minHeight: 280, px: '28px', py: '24px' } },
        },
        ...customSx,
      ]}
    >
      <Box
        aria-hidden="true"
        sx={{
          bottom: 0,
          contain: 'paint',
          // Takes on the card's peach tint.
          mixBlendMode: 'multiply',
          height: '100%',
          pointerEvents: 'none',
          position: 'absolute',
          right: 0,
          top: 0,
          width: '48%',
          zIndex: 0,
          '& svg, & img': { display: 'block', filter: artworkTint, height: '100%', width: '100%' },
          '@container continue-card (min-width: 478px) and (max-width: 637px)': { width: '44%' },
          '@container continue-card (max-width: 477px)': { opacity: 0.22, width: 145 },
          [tallHero]: { opacity: 1, width: '70%' },
        }}
      >
        {illustration}
      </Box>
      {/* A peeking card shows its artwork across the whole card instead of its text. On the left it is mirrored, so
          the edge that shows carries the subject of the photo instead of its pale side. */}
      <Box
        aria-hidden="true"
        sx={{
          contain: 'paint',
          inset: 0,
          mixBlendMode: 'multiply',
          opacity: peek,
          pointerEvents: 'none',
          position: 'absolute',
          scale: 'var(--carousel-side, 1) 1',
          zIndex: 0,
          '& svg, & img': {
            display: 'block',
            filter: artworkTint,
            height: '100%',
            maskImage: 'none !important',
            width: '100%',
          },
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
          [tallHero]: { alignItems: 'center', '& .continue-study-copy': { width: '58%' } },
        }}
      >
        <Box className="continue-study-copy" sx={{ minWidth: 0, opacity: `calc(1 - 2 * ${peek})` }}>
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
            <Box component="span" sx={{ display: 'block', mt: '8px' }}>
              <ProgressTrack percent={progress.percent} sx={{ width: 120 }} />
              <Typography
                id={progressId}
                variant="caption"
                component="span"
                sx={{ color: 'text.secondary', display: 'block', mt: '4px' }}
              >
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
