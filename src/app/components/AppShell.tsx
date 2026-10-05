import type { ReactNode } from 'react';
import { Box } from '@mui/material';

export function AppShell({ header, children, busy = false }: { header: ReactNode; children: ReactNode; busy?: boolean }) {
  return <Box sx={{ minHeight: '100vh', '@supports (min-height: 100dvh)': { minHeight: '100dvh' }, display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
    {header}
    <Box component="main" aria-busy={busy} sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</Box>
  </Box>;
}
