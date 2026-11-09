import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import type { CompletedAttempt } from '../../../../domain/types';
import { formatDateTime, formatDuration } from '../../format';
import { radius } from '../../../../shared/theme';

export function PastAttemptsDialog({
  quizName,
  attempts,
  onSelect,
  onClose,
}: {
  quizName: string;
  attempts: readonly CompletedAttempt[];
  onSelect: (attempt: CompletedAttempt) => void;
  onClose: () => void;
}) {
  const { scoreRing } = useTheme().palette;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="past-attempts-dialog-title">
      <DialogTitle id="past-attempts-dialog-title" sx={{ pr: 6, position: 'relative' }}>
        Review Attempts
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'baseline', px: 3, pb: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 0 }}>
          {quizName}
        </Typography>
        {attempts.length > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', flexShrink: 0 }}>
            {attempts.length} {attempts.length === 1 ? 'attempt' : 'attempts'}
          </Typography>
        )}
      </Stack>
      <DialogContent sx={{ pt: 0 }}>
        {attempts.length === 0 ? (
          <DialogContentText>Older attempts are no longer saved on this device.</DialogContentText>
        ) : (
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {attempts.map((attempt) => {
              const { percentage } = attempt.score;
              const color = percentage < 50 ? scoreRing.low : percentage < 75 ? scoreRing.fair : scoreRing.high;
              const date = formatDateTime(attempt.completedAt);
              return (
                <Card key={attempt.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="subtitle1">{date}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {attempt.feedbackMode === 'immediate' ? 'Fast Feedback' : 'Exam Mode'} · Elapsed Time:{' '}
                        {formatDuration(attempt.score.elapsedMs)}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      aria-label={`Review attempt from ${date}`}
                      onClick={() => onSelect(attempt)}
                    >
                      Review
                    </Button>
                  </Stack>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 1.5 }}>
                    <LinearProgress
                      variant="determinate"
                      value={percentage}
                      aria-label="Score"
                      sx={{
                        flexGrow: 1,
                        height: 7,
                        borderRadius: radius.pill,
                        bgcolor: alpha(color, 0.15),
                        '& .MuiLinearProgress-bar': { borderRadius: radius.pill, bgcolor: color },
                      }}
                    />
                    <Typography variant="subtitle1">{percentage}%</Typography>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
