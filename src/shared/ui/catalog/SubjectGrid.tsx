import type { ReactNode } from 'react';
import { Box } from '@mui/material';

export function SubjectGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      data-testid="all-subjects-grid"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
        gap: 2,
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  );
}
