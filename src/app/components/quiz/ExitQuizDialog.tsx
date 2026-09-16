import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton } from '@mui/material';

interface ExitQuizDialogProps {
  open: boolean;
  onClose: () => void;
  onLeave: () => void;
  onAbort: () => void;
}

export function ExitQuizDialog({ open, onClose, onLeave, onAbort }: ExitQuizDialogProps) {
  return <Dialog open={open} onClose={onClose} aria-labelledby="test-exit-dialog-title">
    <DialogTitle id="test-exit-dialog-title" sx={{ pr: 6, position: 'relative' }}>Leave or Abort this Test?
      <IconButton aria-label="Continue test" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseRoundedIcon /></IconButton>
    </DialogTitle>
    <DialogContent><DialogContentText>Leaving saves your progress and pauses the stopwatch. Aborting discards this test and its saved progress.</DialogContentText></DialogContent>
    <DialogActions><Button variant="contained" onClick={onLeave}>Leave</Button><Button color="error" variant="outlined" onClick={onAbort}>Abort</Button></DialogActions>
  </Dialog>;
}
