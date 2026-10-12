import type { ReactNode } from 'react';
import { Box } from '@mui/material';

export function SubjectGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      data-testid="all-subjects-grid"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        gap: 2,
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  );
}
