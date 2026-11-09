import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { fontWeight, radius } from '../../theme';

export function SubjectProgressSummary({
  label,
  percent,
  activeCount = 0,
}: {
  label?: ReactNode;
  percent?: number;
  activeCount?: number;
}) {
  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: { xs: 40, sm: 20 }, flexWrap: 'wrap' }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 20 }}>
          {label}
        </Stack>
        <Typography
          component="span"
          variant="caption"
          sx={{ color: 'primary.dark', fontWeight: fontWeight.semibold, minHeight: 20, whiteSpace: 'nowrap' }}
        >
          {activeCount > 0 ? `${activeCount} in progress` : ' '}
        </Typography>
      </Stack>
      <ProgressTrack percent={percent} testId="subject-score-track" />
    </Stack>
  );
}

export function SubjectProgressLabel({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ color: 'primary.dark', fontWeight: fontWeight.semibold }}>
      {children}
    </Typography>
  );
}

/** Decorative progress bar; pair it with visible text that states the same progress. */
export function ProgressTrack({ percent, testId, sx }: { percent?: number; testId?: string; sx?: SxProps<Theme> }) {
  const theme = useTheme();
  const hasPercent = percent !== undefined && Number.isFinite(percent) && percent >= 0 && percent <= 100;
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-testid={testId}
      sx={[
        {
          bgcolor: alpha(theme.palette.text.primary, 0.06),
          borderRadius: radius.pill,
          display: 'block',
          height: 6,
          overflow: 'hidden',
          width: '100%',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="span"
        sx={{
          bgcolor: 'primary.main',
          borderRadius: 'inherit',
          display: 'block',
          height: '100%',
          width: hasPercent ? `${percent}%` : 0,
        }}
      />
    </Box>
  );
}
