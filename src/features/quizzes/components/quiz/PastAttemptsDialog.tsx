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
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {quizName}
        </Typography>
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
                  <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {date}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {attempt.feedbackMode === 'immediate' ? 'Fast Feedback' : 'Exam Mode'} ·{' '}
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
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
                    <LinearProgress
                      variant="determinate"
                      value={percentage}
                      aria-label="Score"
                      sx={{
                        flexGrow: 1,
                        height: 7,
                        borderRadius: 5,
                        bgcolor: alpha(color, 0.15),
                        '& .MuiLinearProgress-bar': { borderRadius: 5, bgcolor: color },
                      }}
                    />
                    <Typography fontWeight={700}>{percentage}%</Typography>
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
