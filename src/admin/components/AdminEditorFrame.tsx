import type { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';

/** Stacked panels fill the available width without stretching their height. */
const adminEditorLayout = { width: { xs: '100%', lg: 'auto' }, flex: { xs: 'none', lg: 1 }, minWidth: 0 };

export function AdminEditorFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Paper component="section" aria-label={label} variant="outlined" sx={{ ...adminEditorLayout, p: 2 }}>
      {children}
    </Paper>
  );
}
export function AdminEditorEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', py: 6, px: 2, textAlign: 'center' }}>
      <Typography variant="h6">{title}</Typography>
      {children}
    </Stack>
  );
}
export function AdminEditorActions({
  dirty,
  busy,
  children,
  statusVisible = true,
}: {
  dirty: boolean;
  busy?: boolean;
  children: ReactNode;
  statusVisible?: boolean;
}) {
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {statusVisible && (
          <Typography variant="body2" aria-live="polite" sx={{ color: 'text.secondary', mr: 'auto' }}>
            {busy ? 'Working…' : dirty ? 'Unsaved edits' : 'Saved to draft'}
          </Typography>
        )}
        {children}
      </Stack>
    </Box>
  );
}
