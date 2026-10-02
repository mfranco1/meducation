import { Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { LoadingSkeleton } from './LoadingSkeleton';

interface StatCardProps {
  label: string;
  value: ReactNode;
  badge?: string;
  variant?: 'dashboard' | 'results';
}

export function StatCard({ label, value, badge, variant = 'dashboard' }: StatCardProps) {
  return <Card sx={{ flex: 1 }}><CardContent>
    <Stack alignItems="center" direction="row" spacing={.75} sx={{ flexWrap: 'wrap', rowGap: .5 }}>
      <Typography color="text.secondary" variant="body2">{label}</Typography>
      {badge && <Chip label={badge} size="small" sx={{ height: 20, '& .MuiChip-label': { px: .75 } }} />}
    </Stack>
    <Typography variant={variant === 'dashboard' ? 'h4' : 'h5'} sx={{ mt: variant === 'dashboard' ? .75 : 0 }}>{value === null ? <LoadingSkeleton width="5rem" /> : value}</Typography>
  </CardContent></Card>;
}
