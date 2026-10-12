import { Box, Stack, Typography, alpha, useTheme } from '@mui/material';
import type { ScoreTrend } from '../../../analytics/analytics';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';

export function SubjectScoreSummary({ score, trend }: { score?: number; trend?: ScoreTrend }) {
  const theme = useTheme();
  const hasScore = score !== undefined && Number.isFinite(score) && score >= 0 && score <= 100;
  return (
    <Stack spacing={0.75}>
      {hasScore && (
        <Stack alignItems="center" direction="row" spacing={0.75}>
          <Typography variant="body2" sx={{ color: 'primary.dark', fontSize: '0.875rem', fontWeight: 700 }}>
            Latest Score {score}%
          </Typography>
          {trend && <ScoreTrendIndicator trend={trend} />}
        </Stack>
      )}
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
            width: hasScore ? `${score}%` : 0,
          }}
        />
      </Box>
    </Stack>
  );
}
