import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import type { ReactNode } from 'react';

export function SubjectProgressSummary({
  label,
  percent,
  activeCount = 0,
}: {
  label?: ReactNode;
  percent?: number;
  activeCount?: number;
}) {
  const theme = useTheme();
  const hasPercent = percent !== undefined && Number.isFinite(percent) && percent >= 0 && percent <= 100;
  return (
    <Stack spacing={0.75}>
      <Stack
        alignItems="center"
        direction="row"
        justifyContent="space-between"
        spacing={0.75}
        sx={{ minHeight: { xs: 40, sm: 20 }, flexWrap: 'wrap' }}
      >
        <Stack alignItems="center" direction="row" spacing={0.75} sx={{ minHeight: 20 }}>
          {label}
        </Stack>
        <Typography
          component="span"
          variant="caption"
          sx={{ color: 'primary.dark', fontWeight: 700, minHeight: 20, whiteSpace: 'nowrap' }}
        >
          {activeCount > 0 ? `${activeCount} in progress` : ' '}
        </Typography>
      </Stack>
      <Box
        aria-hidden="true"
        data-testid="subject-score-track"
        sx={{
          bgcolor: alpha(theme.palette.text.primary, 0.06),
          borderRadius: 99,
          height: 6,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <Box
          sx={{
            bgcolor: 'primary.main',
            borderRadius: 'inherit',
            height: '100%',
            transition: 'none',
            width: hasPercent ? `${percent}%` : 0,
          }}
        />
      </Box>
    </Stack>
  );
}

export function SubjectProgressLabel({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ color: 'primary.dark', fontSize: '0.875rem', fontWeight: 700 }}>
      {children}
    </Typography>
  );
}
