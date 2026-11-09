import type { Theme } from '@mui/material';

/** Structural hairline in the app's choice-border tone. */
export const hairline = (theme: Theme) => `1px solid ${theme.palette.feedback.choiceBorder}`;
