import type { ReactNode } from 'react';
import { Box } from '@mui/material';

export function DrawerSurface({ children, edgeToggle }: { children: ReactNode; edgeToggle?: ReactNode }) {
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'visible' }}>
      <Box
        sx={{
          width: '100%',
          height: '100%',
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}
      >
        {children}
      </Box>
      {edgeToggle}
    </Box>
  );
}
