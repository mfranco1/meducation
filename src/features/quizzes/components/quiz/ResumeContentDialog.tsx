import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

export function ResumeContentDialog({
  open, reason, onCancel, onRestart,
}: {
  open: boolean;
  reason?: 'legacy' | 'changed';
  onCancel: () => void;
  onRestart: () => void;
}) {
  return <Dialog open={open} onClose={onCancel} aria-labelledby="resume-content-title">
    <DialogTitle id="resume-content-title">Restart Saved Test?</DialogTitle>
    <DialogContent><DialogContentText>
      {reason === 'legacy'
        ? 'This test was saved before content tracking was added. Its original questions cannot be verified against the current version.'
        : 'This test was saved with different questions or answers. Its original content is no longer available.'}
      {' '}Restarting uses the current questions and replaces this unfinished test. Your completed results remain saved.
    </DialogContentText></DialogContent>
    <DialogActions><Button onClick={onCancel}>Resume</Button><Button variant="contained" onClick={onRestart}>Restart</Button></DialogActions>
  </Dialog>;
}
