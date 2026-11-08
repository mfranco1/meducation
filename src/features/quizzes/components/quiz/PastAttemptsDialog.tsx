import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import type { CompletedAttempt } from '../../../../domain/types';

export function PastAttemptsDialog({
  attempts,
  onSelect,
  onClose,
}: {
  attempts: readonly CompletedAttempt[];
  onSelect: (attempt: CompletedAttempt) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="past-attempts-dialog-title">
      <DialogTitle id="past-attempts-dialog-title">Review attempts</DialogTitle>
      <DialogContent>
        {attempts.length === 0 ? (
          <DialogContentText>Older attempts are no longer saved on this device.</DialogContentText>
        ) : (
          <List disablePadding>
            {attempts.map((attempt) => (
              <ListItemButton key={attempt.id} onClick={() => onSelect(attempt)}>
                <ListItemText
                  primary={new Date(attempt.completedAt).toLocaleString()}
                  secondary={`${attempt.score.percentage}% · ${attempt.feedbackMode === 'immediate' ? 'Fast Feedback' : 'Exam Mode'}`}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
