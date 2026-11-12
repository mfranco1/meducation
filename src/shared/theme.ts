import type { CSSProperties } from 'react';
import { alpha, createTheme } from '@mui/material/styles';
import { brand } from './brand';

interface FeedbackTone {
  surface: string;
  border: string;
  separator: string;
}

interface FeedbackPalette {
  correct: FeedbackTone;
  incorrect: FeedbackTone;
  review: FeedbackTone;
  choiceBorder: string;
}

interface ScoreRingPalette {
  low: string;
  fair: string;
  good: string;
  high: string;
}

interface RewardPalette {
  main: string;
  light: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    feedback: FeedbackPalette;
    scoreRing: ScoreRingPalette;
    reward: RewardPalette;
  }
  interface PaletteOptions {
    feedback?: FeedbackPalette;
    scoreRing?: ScoreRingPalette;
    reward?: RewardPalette;
  }
  interface TypographyVariants {
    display: CSSProperties;
    lede: CSSProperties;
    stem: CSSProperties;
    stat: CSSProperties;
  }
  interface TypographyVariantsOptions {
    display?: CSSProperties;
    lede?: CSSProperties;
    stem?: CSSProperties;
    stat?: CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    display: true;
    lede: true;
    stem: true;
    stat: true;
  }
}

/**
 * Shape and depth tokens. Use these instead of raw values (lint enforces it); sx numbers
 * multiply shape.borderRadius, so never write `borderRadius: 1`. See docs/design-system.md.
 */
export const radius = {
  /** Inline code. */
  inline: '6px',
  /** Buttons, toggles, inputs, nav items, list rows, answer choices, navigator tiles. */
  control: '10px',
  /** Pale square behind an icon. */
  badge: '12px',
  /** Cards, panels, dialogs, toasts, images, tables. */
  card: '14px',
  /** Continue Studying card and the large empty-state badge. */
  feature: '22px',
  /** Flashcard faces (deliberately larger). */
  flashcard: { xs: '22px', sm: '28px' },
  /** Progress bars and segmented filters. */
  pill: '999px',
  circle: '50%',
} as const;

export const shadowTint = 'rgba(70, 38, 20, ';
export const shadow = {
  /** Resting cards. */
  card: `0 3px 14px ${shadowTint}.045)`,
  /** Small floating elements: toasts, carousel arrows. */
  raised: `0 2px 8px ${shadowTint}.1)`,
  /** Bars floating over content, such as the sticky landing header. */
  overlay: `0 8px 24px ${shadowTint}.07)`,
  /** Marks the current item, such as the current navigator tile. */
  currentRing: `0 0 0 3px ${alpha(brand.accentColor, 0.18)}`,
} as const;

/** The one keyboard focus ring. Spread into a `:focus-visible` or `.Mui-focusVisible` rule. */
export const focusRing = { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' } as const;
/** For elements whose parent clips overflow. */
export const focusRingInset = { ...focusRing, outlineOffset: '-2px' } as const;

const hairline = '#eee5df';

/** The three type weights plus the heading weight. Set weight through a variant, not `sx`. */
export const fontWeight = { regular: 400, medium: 500, semibold: 600, heading: 650 } as const;

/** Code and JSON editing fields. */
export const monoFontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const { up } = createTheme().breakpoints;
const heading = { fontWeight: fontWeight.heading, textWrap: 'balance' } as const;

export const theme = createTheme({
  palette: {
    mode: 'light',
    divider: hairline,
    primary: { main: brand.accentColor, dark: '#853812', light: '#f7dfcf' },
    background: { default: '#fbf8f5', paper: '#fffdfb' },
    text: { primary: '#27211e', secondary: '#766a63' },
    success: { main: '#2f7a55' },
    info: { main: '#4e5e73' },
    warning: { main: '#8a6410' },
    error: { main: '#b73b32' },
    scoreRing: { low: '#b73b32', fair: '#c69a16', good: '#8ab85a', high: '#2f7a55' },
    reward: { main: '#e0a516', light: '#ffd95a' },
    feedback: {
      correct: { surface: '#e4f2e9', border: '#b9dec6', separator: '#cce6d5' },
      incorrect: {
        surface: '#fae9e6',
        border: '#f0c6bf',
        separator: '#f3d3cd',
      },
      review: { surface: '#fff4dd', border: '#e9cf98', separator: '#f0dcaf' },
      choiceBorder: '#e8dfd9',
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeightRegular: fontWeight.regular,
    fontWeightMedium: fontWeight.medium,
    fontWeightBold: fontWeight.heading,
    /** Landing hero headline. */
    display: {
      ...heading,
      fontSize: 'clamp(2.25rem, 10vw, 2.625rem)',
      lineHeight: 1.04,
      letterSpacing: '-.02em',
      [up('sm')]: { fontSize: '3.25rem' },
      [up('lg')]: { fontSize: '4rem' },
    },
    /** Screen titles. */
    h1: {
      ...heading,
      fontSize: '1.875rem',
      lineHeight: 1.15,
      letterSpacing: '-.03em',
      [up('sm')]: { fontSize: '2.125rem' },
    },
    /** Landing section headings and closing call to action. */
    h2: {
      ...heading,
      fontSize: '2rem',
      lineHeight: 1.1,
      letterSpacing: '-.02em',
      [up('md')]: { fontSize: '2.75rem' },
      [up('lg')]: { fontSize: '3.25rem' },
    },
    /** Subject header name. */
    h3: {
      ...heading,
      fontSize: '1.5rem',
      lineHeight: 1.15,
      letterSpacing: '-.025em',
      [up('sm')]: { fontSize: '3rem' },
    },
    /** Dialog hero titles. */
    h4: { ...heading, fontSize: '1.75rem', lineHeight: 1.2, letterSpacing: '-.02em' },
    /** Panel titles. */
    h5: { ...heading, fontSize: '1.375rem', lineHeight: 1.3, letterSpacing: '-.015em' },
    /** Section headings. */
    h6: { ...heading, fontSize: '1.125rem', lineHeight: 1.35, letterSpacing: '-.01em' },
    subtitle1: { fontWeight: fontWeight.semibold, fontSize: '1rem', lineHeight: 1.5 },
    subtitle2: { fontWeight: fontWeight.semibold, fontSize: '.875rem', lineHeight: 1.5 },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '.875rem', lineHeight: 1.55 },
    caption: { fontSize: '.8125rem', lineHeight: 1.5 },
    overline: { fontWeight: fontWeight.semibold, fontSize: '.75rem', lineHeight: 1.5, letterSpacing: '.12em' },
    button: { fontWeight: fontWeight.semibold, textTransform: 'none' },
    /** Landing lede under the headline. */
    lede: { fontSize: '1.0625rem', lineHeight: 1.55, [up('md')]: { fontSize: '1.1875rem' } },
    /** Question stems and flashcard fronts. */
    stem: { fontWeight: fontWeight.medium, fontSize: '1.25rem', lineHeight: 1.5, [up('sm')]: { fontSize: '1.375rem' } },
    /** Large numbers: stat values, scores. Tabular so digits do not shift. */
    stat: {
      fontWeight: fontWeight.heading,
      fontSize: '1.625rem',
      lineHeight: 1.1,
      letterSpacing: '-.03em',
      fontVariantNumeric: 'tabular-nums',
      [up('sm')]: { fontSize: '1.75rem' },
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${hairline}`,
          boxShadow: shadow.card,
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: { circle: { strokeLinecap: 'round' } },
    },
    MuiButton: {
      styleOverrides: { root: { borderRadius: radius.control, padding: '9px 16px' }, sizeLarge: { fontSize: '1rem' } },
    },
    MuiToggleButton: {
      styleOverrides: { root: { borderRadius: radius.control } },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: radius.control } },
    },
    MuiTypography: {
      defaultProps: {
        variantMapping: { display: 'h1', lede: 'p', stem: 'p', stat: 'p', subtitle1: 'p', subtitle2: 'p' },
      },
    },
  },
});
