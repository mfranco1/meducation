import type { SxProps, Theme } from '@mui/material';

/** KaTeX Main ships with the app's math rendering; the landing page uses it as its editorial serif. */
export const serif = 'KaTeX_Main, "Iowan Old Style", Charter, Georgia, serif';

/** The landing type scale. Product components keep the theme's own type. */
export const type = {
  display: { fontFamily: serif, fontWeight: 400, fontSize: { xs: 'clamp(2rem, 9vw, 2.375rem)', sm: '3rem', md: '2.75rem', lg: 'clamp(3rem, 3.6vw, 3.75rem)' }, lineHeight: 1.06, letterSpacing: '-.012em', m: 0 },
  section: { fontFamily: serif, fontWeight: 400, fontSize: { xs: '1.75rem', md: '2.5rem' }, lineHeight: 1.12, letterSpacing: '-.008em', m: 0 },
  lede: { fontSize: { xs: '1.0625rem', md: '1.1875rem' }, lineHeight: 1.55, maxWidth: '38ch', color: 'text.primary', m: 0 },
  body: { fontSize: '1rem', lineHeight: 1.65, maxWidth: '62ch', m: 0 },
  label: { fontSize: '.75rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '.12em', textTransform: 'uppercase', color: 'text.secondary', m: 0 },
  note: { fontFamily: serif, fontStyle: 'italic', fontSize: '.9375rem', lineHeight: 1.5, color: 'text.secondary', m: 0 },
  caption: { fontSize: '.8125rem', lineHeight: 1.5, color: 'text.secondary', m: 0 },
  folio: { fontFamily: serif, fontWeight: 400, fontSize: { xs: '1.5rem', md: '2rem' }, lineHeight: 1, color: 'text.primary' },
} satisfies Record<string, SxProps<Theme>>;

/** Structural hairline in the app's choice-border tone. */
export const hairline = (theme: Theme) => `1px solid ${theme.palette.feedback.choiceBorder}`;
