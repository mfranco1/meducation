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

const shadowTint = 'rgba(70, 38, 20, ';
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

export const theme = createTheme({
  palette: {
    mode: 'light',
    divider: hairline,
    primary: { main: brand.accentColor, dark: '#853812', light: '#f7dfcf' },
    background: { default: '#fbf8f5', paper: '#fffdfb' },
    text: { primary: '#27211e', secondary: '#766a63' },
    success: { main: '#2f7a55' },
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
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h3: { fontWeight: 750, letterSpacing: '-.045em' },
    h4: { fontWeight: 720, letterSpacing: '-.035em' },
    h5: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 700 },
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
      styleOverrides: { root: { borderRadius: radius.control, padding: '9px 16px' } },
    },
    MuiToggleButton: {
      styleOverrides: { root: { borderRadius: radius.control } },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: radius.control } },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontWeight: 700 } },
    },
  },
});
