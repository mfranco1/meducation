import type { SxProps, Theme } from '@mui/material';

/** The landing type scale, in the theme's sans and heading weights. */
export const type = {
  display: {
    fontWeight: 600,
    fontSize: { xs: 'clamp(2.25rem, 10vw, 2.625rem)', sm: '3.25rem', md: '3.25rem', lg: '4rem' },
    lineHeight: 1.04,
    letterSpacing: '-.03em',
    textWrap: 'balance',
    m: 0,
  },
  section: {
    fontWeight: 600,
    fontSize: { xs: '2rem', md: '2.75rem', lg: '3.25rem' },
    lineHeight: 1.1,
    letterSpacing: '-.025em',
    textWrap: 'balance',
    m: 0,
  },
  lede: {
    fontSize: { xs: '1.0625rem', md: '1.1875rem' },
    lineHeight: 1.55,
    maxWidth: '44ch',
    color: 'text.secondary',
    m: 0,
  },
  body: { fontSize: '1rem', lineHeight: 1.65, maxWidth: '62ch', m: 0 },
  label: {
    fontSize: '.75rem',
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    color: 'text.secondary',
    m: 0,
  },
  caption: { fontSize: '.8125rem', lineHeight: 1.5, color: 'text.secondary', m: 0 },
} satisfies Record<string, SxProps<Theme>>;

/** Structural hairline in the app's choice-border tone. */
export const hairline = (theme: Theme) => `1px solid ${theme.palette.feedback.choiceBorder}`;
