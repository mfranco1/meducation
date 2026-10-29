import type { SxProps, Theme } from '@mui/material';

/** The landing type scale, in the theme's sans and heading weights. */
export const type = {
  display: { fontWeight: 800, fontSize: { xs: 'clamp(2rem, 9vw, 2.375rem)', sm: '3rem', md: '2.75rem', lg: 'clamp(3rem, 3.6vw, 3.5rem)' }, lineHeight: 1.08, letterSpacing: '-.04em', m: 0 },
  section: { fontWeight: 800, fontSize: { xs: '1.75rem', md: '2.25rem' }, lineHeight: 1.15, letterSpacing: '-.035em', m: 0 },
  lede: { fontSize: { xs: '1.0625rem', md: '1.1875rem' }, lineHeight: 1.55, maxWidth: '38ch', color: 'text.secondary', m: 0 },
  body: { fontSize: '1rem', lineHeight: 1.65, maxWidth: '62ch', m: 0 },
  label: { fontSize: '.75rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '.12em', textTransform: 'uppercase', color: 'text.secondary', m: 0 },
  caption: { fontSize: '.8125rem', lineHeight: 1.5, color: 'text.secondary', m: 0 },
} satisfies Record<string, SxProps<Theme>>;

/** Structural hairline in the app's choice-border tone. */
export const hairline = (theme: Theme) => `1px solid ${theme.palette.feedback.choiceBorder}`;
