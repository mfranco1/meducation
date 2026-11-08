import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
} from '@mui/material';

export function LeaveReviewDialog({
  open,
  onClose,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  onLeave: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="leave-review-dialog-title">
      <DialogTitle id="leave-review-dialog-title" sx={{ pr: 6, position: 'relative' }}>
        Leave Review?
        <IconButton aria-label="Keep reviewing" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          Your score is saved. You can review this attempt again from the subject page.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onLeave}>
          Leave
        </Button>
      </DialogActions>
    </Dialog>
  );
}
