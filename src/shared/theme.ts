import { createTheme } from '@mui/material/styles';
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

declare module '@mui/material/styles' {
  interface Palette {
    feedback: FeedbackPalette;
    scoreRing: ScoreRingPalette;
  }
  interface PaletteOptions {
    feedback?: FeedbackPalette;
    scoreRing?: ScoreRingPalette;
  }
}

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: brand.accentColor, dark: '#853812', light: '#f7dfcf' },
    background: { default: '#fbf8f5', paper: '#fffdfb' },
    text: { primary: '#27211e', secondary: '#766a63' },
    success: { main: '#2f7a55' },
    error: { main: '#b73b32' },
    scoreRing: { low: '#b73b32', fair: '#c69a16', good: '#8ab85a', high: '#2f7a55' },
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
          border: '1px solid #eee5df',
          boxShadow: '0 3px 14px rgba(70, 38, 20, .045)',
        },
      },
    },
    MuiButton: {
      styleOverrides: { root: { borderRadius: 10, padding: '9px 16px' } },
    },
  },
});
