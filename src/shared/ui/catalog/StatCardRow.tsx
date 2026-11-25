import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { radius, shadow } from '../../theme';

const panel = {
  backgroundColor: (theme: Theme) => alpha(theme.palette.primary.main, 0.07),
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: radius.card,
  boxShadow: shadow.card,
  gap: 0,
} as const;

const bareCard = {
  backgroundColor: 'transparent',
  border: 0,
  borderRadius: 0,
  boxShadow: 'none',
  minHeight: 0,
} as const;

/** The stat cards merged into one panel with a rule between them. */
const strip = {
  ...panel,
  flexDirection: 'row',
  '& .stat-card': { ...bareCard, flex: '1 1 0' },
  '& .stat-card + .stat-card': { borderLeft: '1px solid', borderColor: 'divider' },
  '& .stat-head > *': { m: 0 },
  '& .stat-footer > *': { flexWrap: 'wrap', rowGap: 0.5 },
} as const;

/**
 * Dashboard stat cards. Inside a `study-hero` container (beside Continue Studying) they merge into one strip,
 * compact on narrow widths and with icons on wider ones. In a `study-hero-panel` container on wide widths they
 * stack into one narrow panel instead.
 */
export function StatCardRow({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      className="stat-card-row"
      sx={[
        {
          alignItems: 'stretch',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          mb: 3,
          '& > *': { minWidth: 0 },
          '@container study-hero (max-width: 599px)': {
            ...strip,
            '& .stat-card .MuiCardContent-root, & .stat-card .MuiCardContent-root:last-child': { p: 1.5 },
            '& .stat-icon': { display: 'none' },
            '& .stat-value': { typography: 'h5', minHeight: 0, mt: 0.5 },
            '& .stat-support': { typography: 'caption', mt: 0.5 },
          },
          '@container study-hero (min-width: 600px)': {
            ...strip,
            '& .stat-card .MuiCardContent-root, & .stat-card .MuiCardContent-root:last-child': { px: 2.5, py: 2 },
            '& .stat-head': { columnGap: 1, flexWrap: 'nowrap' },
            '& .stat-icon': { fontSize: 20 },
            '& .stat-value': { minHeight: 0, mt: 1 },
            '& .stat-support': { mt: 0.5 },
          },
          '@container study-hero-panel (min-width: 960px)': {
            flexDirection: 'column',
            height: '100%',
            px: 2.5,
            py: 0.5,
            boxSizing: 'border-box',
            '& .stat-card': { alignItems: 'center', display: 'flex' },
            '& .stat-card + .stat-card': { borderLeft: 0, borderTop: '1px solid', borderColor: 'divider' },
            '& .stat-card .MuiCardContent-root, & .stat-card .MuiCardContent-root:last-child': {
              alignItems: 'center',
              columnGap: 1.5,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              px: 0,
              py: 1.5,
              width: '100%',
            },
            '& .stat-head': { columnGap: 1.5, gridColumn: 1, gridRow: 1 },
            '& .stat-icon': { fontSize: 24 },
            '& .stat-support': { gridColumn: 1, gridRow: 2, minHeight: 0, mt: 0.5, pl: '36px' },
            '& .stat-value': { gridColumn: 2, gridRow: '1 / span 2', justifySelf: 'end', minHeight: 0, mt: 0 },
            // Values without a % suffix reserve its width so all numbers right-align on their digits.
            '& .stat-value:not(:has(.stat-suffix))::after': {
              content: '"%"',
              fontSize: '0.7em',
              lineHeight: 1,
              ml: '1px',
              visibility: 'hidden',
            },
            '& .stat-footer': { gridColumn: '1 / -1' },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
