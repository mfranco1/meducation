import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Box, CardActionArea, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useId, type ReactNode } from 'react';

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
          border: '1px solid #f4ebe5',
          borderRadius: '22px',
          boxSizing: 'border-box',
          containerName: 'continue-card',
          containerType: 'inline-size',
          height: '100%',
          isolation: 'isolate',
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(110deg, #fcf7f3 0%, #fff8f2 58%, #ffe5d3 100%)',
          '& .continue-study-action': {
            minHeight: 232,
            pl: 'calc(22px + var(--study-carousel-control-gutter, 0px))',
            pr: 'calc(38px + var(--study-carousel-control-gutter, 0px))',
            py: '22px',
          },
          '@container continue-card (min-width: 298px) and (max-width: 477px)': {
            '& .continue-study-action': {
              pl: 'calc(22px + var(--study-carousel-control-gutter, 0px))',
              pr: 'calc(38px + var(--study-carousel-control-gutter, 0px))',
              py: '22px',
            },
          },
          '@container continue-card (max-width: 297px)': {
            '& .continue-study-action': {
              pl: 'calc(16px + var(--study-carousel-control-gutter, 0px))',
              pr: 'calc(34px + var(--study-carousel-control-gutter, 0px))',
              py: '16px',
            },
          },
          '@container continue-card (min-width: 478px)': {
            '& .continue-study-action': {
              minHeight: 244,
              px: 0,
              pl: 'calc(26px + var(--study-carousel-control-gutter, 0px))',
              pr: 'calc(26px + var(--study-carousel-control-gutter, 0px))',
              py: '26px',
            },
          },
          '@container continue-card (min-width: 638px)': {
            '& .continue-study-action': {
              minHeight: 256,
              pl: 'calc(38px + var(--study-carousel-control-gutter, 0px))',
              pr: 'calc(38px + var(--study-carousel-control-gutter, 0px))',
              py: '34px',
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
          '& svg': { display: 'block', height: '100%', width: '100%' },
          '@container continue-card (min-width: 478px) and (max-width: 637px)': { width: '44%' },
          '@container continue-card (max-width: 477px)': {
            bottom: 0,
            height: 150,
            opacity: 0.22,
            top: 'auto',
            width: 145,
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
        aria-describedby={activityId}
        onClick={() => onContinue()}
        sx={{
          alignItems: 'stretch',
          boxSizing: 'border-box',
          color: 'inherit',
          display: 'flex',
          justifyContent: 'flex-start',
          minWidth: 0,
          position: 'relative',
          textAlign: 'left',
          width: '100%',
          zIndex: 1,
          '&.Mui-focusVisible': {
            outline: '3px solid',
            outlineColor: 'primary.main',
            outlineOffset: '-3px',
            borderRadius: 'inherit',
          },
          '&:hover .continue-study-cta': { filter: 'brightness(.96)' },
          '@container continue-card (min-width: 638px)': { '& .continue-study-copy': { width: '55%' } },
          '@container continue-card (min-width: 478px) and (max-width: 637px)': {
            '& .continue-study-copy': { width: '58%' },
          },
          '@container continue-card (max-width: 477px)': {
            '& .continue-study-copy': {
              borderRadius: '14px',
              background:
                'linear-gradient(90deg, rgba(252,247,243,.84) 0%, rgba(252,247,243,.72) 72%, rgba(252,247,243,.3) 100%)',
              width: '100%',
            },
          },
        }}
      >
        <Box className="continue-study-copy" sx={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
          <Typography
            component="span"
            sx={{
              color: 'text.primary',
              display: 'block',
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.4,
              '@container continue-card (min-width: 478px)': { fontSize: 16 },
              '@container continue-card (min-width: 638px)': { fontSize: 18 },
            }}
          >
            {eyebrow}
          </Typography>
          <Typography
            component="span"
            sx={{
              color: 'text.primary',
              display: 'block',
              fontSize: 21,
              fontWeight: 750,
              lineHeight: 1.3,
              mt: '8px',
              overflowWrap: 'anywhere',
              '@container continue-card (min-width: 478px)': { fontSize: 22 },
              '@container continue-card (min-width: 638px)': { fontSize: 24 },
            }}
          >
            {title}
          </Typography>
          <Typography
            id={activityId}
            component="span"
            sx={{
              color: '#62564f',
              display: 'block',
              fontSize: 15,
              lineHeight: 1.5,
              mt: '6px',
              '@container continue-card (min-width: 638px)': { fontSize: 16 },
            }}
          >
            {activityLabel}
          </Typography>
          <Box
            component="span"
            className="continue-study-cta"
            sx={{
              alignItems: 'center',
              bgcolor: '#b9511b',
              background: 'linear-gradient(180deg, #c45117 0%, #b9511b 100%)',
              borderRadius: '14px',
              color: '#fff',
              display: 'inline-flex',
              fontSize: 16,
              fontWeight: 700,
              gap: '10px',
              lineHeight: 1.25,
              minHeight: 48,
              mt: '20px',
              px: '22px',
              transition: 'filter 120ms ease',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              '@container continue-card (min-width: 638px)': { mt: '22px' },
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
