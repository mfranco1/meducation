import { Box } from '@mui/material';
import type { ScoreTrend } from '../../../domain/scores';
import { radius } from '../../../shared/theme';

export function ScoreTrendIndicator({ trend }: { trend: ScoreTrend }) {
  const labels: Record<ScoreTrend, string> = {
    increase: 'Score increased from previous attempt',
    decrease: 'Score decreased from previous attempt',
    unchanged: 'Score unchanged from previous attempt',
  };
  return (
    <Box
      aria-label={labels[trend]}
      component="span"
      role="img"
      sx={
        trend === 'unchanged'
          ? { bgcolor: 'primary.dark', borderRadius: radius.pill, display: 'inline-block', height: 2, width: 10 }
          : {
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              ...(trend === 'increase'
                ? { borderBottom: '8px solid', borderBottomColor: 'success.main' }
                : { borderTop: '8px solid', borderTopColor: 'error.main' }),
              display: 'inline-block',
            }
      }
    />
  );
}
