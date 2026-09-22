import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton } from '@mui/material';

interface SubmitQuizDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function SubmitQuizDialog({ open, onClose, onConfirm }: SubmitQuizDialogProps) {
  return <Dialog open={open} onClose={onClose} aria-labelledby="submit-quiz-dialog-title">
    <DialogTitle id="submit-quiz-dialog-title" sx={{ pr: 6, position: 'relative' }}>Submit Test?
      <IconButton aria-label="Cancel submission" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseRoundedIcon /></IconButton>
    </DialogTitle>
    <DialogContent><DialogContentText>Submitting ends this test and shows your results. Make sure you have finished answering and reviewing your answers.</DialogContentText></DialogContent>
    <DialogActions><Button variant="outlined" onClick={onClose}>Cancel</Button><Button variant="contained" onClick={onConfirm}>Submit</Button></DialogActions>
  </Dialog>;
}
