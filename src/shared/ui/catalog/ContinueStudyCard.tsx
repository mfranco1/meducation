import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Box, CardActionArea, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useId, type ReactNode } from 'react';
import { reducedMotion } from '../motion';
import { focusRingInset, radius } from '../../theme';

export const continueCardBackground = ({ palette }: Theme) =>
  `linear-gradient(110deg, ${palette.background.default} 0%, ${palette.background.paper} 58%, ${palette.primary.light} 100%)`;

export type ContinueStudyCardProps = {
  title: string;
  activityLabel: string;
  onContinue: () => void;
  actionLabel?: string;
  accessibleLabel: string;
  eyebrow?: string;
  illustration: ReactNode;
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
  sx,
}: ContinueStudyCardProps) {
  const activityId = useId();
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
          '& .continue-study-action': {
            minHeight: 152,
            pl: 'calc(24px + var(--study-carousel-control-gutter, 0px))',
            pr: 'calc(40px + var(--study-carousel-control-gutter, 0px))',
            py: '16px',
          },
          '@container continue-card (max-width: 297px)': {
            '& .continue-study-action': {
              pl: 'calc(16px + var(--study-carousel-control-gutter, 0px))',
              pr: 'calc(32px + var(--study-carousel-control-gutter, 0px))',
              py: '12px',
            },
          },
          '@container continue-card (min-width: 478px)': {
            '& .continue-study-action': {
              minHeight: 156,
              px: 0,
              pl: 'calc(24px + var(--study-carousel-control-gutter, 0px))',
              pr: 'calc(24px + var(--study-carousel-control-gutter, 0px))',
              py: '16px',
            },
          },
          '@container continue-card (min-width: 638px)': {
            '& .continue-study-action': {
              minHeight: 160,
              pl: 'calc(32px + var(--study-carousel-control-gutter, 0px))',
              pr: 'calc(32px + var(--study-carousel-control-gutter, 0px))',
              py: '20px',
            },
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
        aria-describedby={activityId}
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
