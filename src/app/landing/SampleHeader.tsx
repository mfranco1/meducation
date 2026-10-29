import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { type } from './typography';

/** Position, subject and navigator tiles above a landing sample, as in a study session. `stacked` keeps the tiles on their own row so long details don't move them. */
export function SampleHeader({ id, title, detail, navLabel, stacked = false, children }: { id: string; title: string; detail: string; navLabel: string; stacked?: boolean; children: ReactNode[] }) {
  return <Stack direction={stacked ? 'column' : 'row'} alignItems={stacked ? 'flex-start' : 'flex-end'} justifyContent="space-between" flexWrap="wrap" columnGap={2} rowGap={1.5} sx={{ mb: 1.5 }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography id={id} component="h2" sx={type.label}>{title}</Typography>
      <Typography sx={{ ...type.caption, mt: .5 }}>{detail}</Typography>
    </Box>
    <Box component="nav" aria-label={navLabel} sx={{ display: 'grid', gridTemplateColumns: `repeat(${children.length}, 44px)`, gap: 1, flexShrink: 0 }}>
      {children}
    </Box>
  </Stack>;
}
