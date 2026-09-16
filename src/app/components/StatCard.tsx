import { Card, CardContent, Typography } from '@mui/material';

interface StatCardProps {
  label: string;
  value: string | number;
  variant?: 'dashboard' | 'results';
}

export function StatCard({ label, value, variant = 'dashboard' }: StatCardProps) {
  return <Card sx={{ flex: 1 }}><CardContent>
    <Typography color="text.secondary" variant="body2">{label}</Typography>
    <Typography variant={variant === 'dashboard' ? 'h4' : 'h5'} sx={{ mt: variant === 'dashboard' ? .75 : 0 }}>{value}</Typography>
  </CardContent></Card>;
}
