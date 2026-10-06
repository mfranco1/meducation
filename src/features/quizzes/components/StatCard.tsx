import { Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { LoadingSkeleton } from '../../../shared/ui/loading/LoadingSkeleton';

interface StatCardProps {
  label: string;
  value: ReactNode;
  badge?: string;
  variant?: 'dashboard' | 'results';
  footer?: ReactNode;
}

export function StatCard({ label, value, badge, variant = 'dashboard', footer }: StatCardProps) {
  return <Card sx={{ flex: 1 }}><CardContent>
    <Stack alignItems="center" direction="row" spacing={.75} sx={{ flexWrap: 'wrap', rowGap: .5 }}>
      <Typography color="text.secondary" variant="body2">{label}</Typography>
      {badge && <Chip label={badge} size="small" sx={{ height: 20, '& .MuiChip-label': { px: .75 } }} />}
    </Stack>
    <Typography variant={variant === 'dashboard' ? 'h4' : 'h5'} sx={{ mt: variant === 'dashboard' ? .75 : 0, minHeight: variant === 'dashboard' ? 44 : undefined }}>{value === null ? <LoadingSkeleton width="5rem" /> : value}</Typography>
    {footer && <Stack sx={{ minHeight: 36, mt: .25 }} justifyContent="flex-end">{footer}</Stack>}
  </CardContent></Card>;
}
