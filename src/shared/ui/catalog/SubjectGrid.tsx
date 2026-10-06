import type { ReactNode } from 'react';
import { Box } from '@mui/material';

export function SubjectGrid({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>
    {children}
  </Box>;
}
