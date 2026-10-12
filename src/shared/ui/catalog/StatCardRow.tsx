import { Stack } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

export function StatCardRow({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      alignItems="stretch"
      sx={[{ mb: 5, '& > *': { minWidth: 0 } }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Stack>
  );
}
