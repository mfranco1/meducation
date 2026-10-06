import type { ReactNode } from 'react';
import { Box } from '@mui/material';

export function AppShell({ header, sidebar, children, busy = false }: { header?: ReactNode; sidebar?: ReactNode; children: ReactNode; busy?: boolean }) {
  return <Box sx={{ minHeight: '100vh', '@supports (min-height: 100dvh)': { minHeight: '100dvh' }, display: 'flex', flexDirection: sidebar ? 'row' : 'column', bgcolor: 'background.default' }}>
    {sidebar}
    <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
      {header}
      <Box component="main" aria-busy={busy} sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</Box>
    </Box>
  </Box>;
}
