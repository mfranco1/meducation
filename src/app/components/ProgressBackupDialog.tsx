import { useRef } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { ProgressBackupController } from '../useProgressBackup';

function emptyWarning(controller: ProgressBackupController): string | undefined {
  const summary = controller.preview?.summary;
  if (!summary) return undefined;
  const noQuiz = summary.savedQuizzes === 0;
  const noFlashcards = summary.savedFlashcardDecks === 0;
  if (noQuiz && noFlashcards) return 'This backup contains no saved progress. Restoring it clears all quiz and flashcard progress in this browser.';
  if (noQuiz) return 'This backup contains no quiz progress. Restoring it clears current quiz progress in this browser.';
  if (noFlashcards) return 'This backup contains no flashcard progress. Restoring it clears current flashcard progress in this browser.';
  return 'Restoring replaces all quiz and flashcard progress in this browser. It does not merge with your current progress.';
}

export function ProgressBackupDialog({ controller }: { controller: ProgressBackupController }) {
  const input = useRef<HTMLInputElement>(null);
  const preview = controller.preview;
  const warning = emptyWarning(controller);
  const locked = controller.committing || controller.recoveryRequired;

  return <Dialog
    open={controller.open}
    onClose={() => controller.close()}
    disableEscapeKeyDown={locked}
    fullWidth
    maxWidth="sm"
    aria-labelledby="progress-backup-title"
    aria-describedby="progress-backup-description"
  >
    <DialogTitle id="progress-backup-title">Progress backup</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography id="progress-backup-description">
          Your progress is saved in this browser. Clearing site data removes it; backups let you keep a copy or move progress to another browser. Backups can include question content for unfinished quizzes, so share them only if you intend to share that data.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" onClick={() => void controller.download()} disabled={controller.busy || locked}>Download backup</Button>
          <Button variant="outlined" onClick={() => input.current?.click()} disabled={controller.busy || locked}>Choose backup file</Button>
          <Box component="input" ref={input} type="file" accept=".json,application/json" aria-label="Choose progress backup file" sx={{ display: 'none' }} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void controller.chooseFile(file);
          }} />
        </Stack>
        {controller.busy && <Typography role="status" aria-live="polite">{controller.status ?? 'Working with progress backup…'}</Typography>}
        {controller.error && <Alert severity={controller.recoveryRequired ? 'error' : 'warning'} role="alert">{controller.error}</Alert>}
        {controller.recoveryRequired && <Button variant="outlined" onClick={() => void controller.retryRecovery()} disabled={controller.busy}>Retry recovery</Button>}
        {preview && <>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Backup preview</Typography>
            <Typography variant="body2">Created {new Date(preview.backup.exportedAt).toLocaleString()}</Typography>
            <Typography variant="body2">Retained completed attempts: {preview.summary.retainedCompletedAttempts}</Typography>
            <Typography variant="body2">Quizzes with saved progress: {preview.summary.savedQuizzes}</Typography>
            <Typography variant="body2">Flashcard decks with saved progress: {preview.summary.savedFlashcardDecks}</Typography>
            <Typography variant="body2">Recorded quiz completions: {preview.summary.quizCompletions}</Typography>
            <Typography variant="body2">Recorded flashcard completions: {preview.summary.flashcardCompletions}</Typography>
            <Typography variant="body2">Total recorded completions: {preview.summary.totalRecordedCompletions}</Typography>
            {preview.currentSummary && <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2">Current progress in this browser</Typography>
              <Typography variant="body2">Retained completed attempts: {preview.currentSummary.retainedCompletedAttempts}</Typography>
              <Typography variant="body2">Quizzes with saved progress: {preview.currentSummary.savedQuizzes}</Typography>
              <Typography variant="body2">Flashcard decks with saved progress: {preview.currentSummary.savedFlashcardDecks}</Typography>
              <Typography variant="body2">Total recorded completions: {preview.currentSummary.totalRecordedCompletions}</Typography>
            </Box>}
          </Box>
          {warning && <Alert severity="warning">{warning}</Alert>}
          {preview.currentBackup
            ? <Button variant="text" onClick={() => void controller.downloadCurrent()} disabled={controller.busy || locked}>Download current backup first</Button>
            : preview.currentProgressIssue
              ? <Stack spacing={1}><Alert severity="warning">Some saved progress could not be read. Restoring this backup will replace it.</Alert>{preview.rawRecovery
                ? <><Typography variant="body2">A raw recovery copy preserves the exact saved values for separate inspection. It may contain invalid data and cannot be imported as a progress backup.</Typography><Button variant="outlined" onClick={controller.downloadRawRecovery} disabled={controller.busy || locked}>Download raw recovery copy</Button></>
                : preview.rawRecoveryTooLarge
                  ? <Typography variant="body2">The raw recovery copy is larger than the 64 MiB limit and cannot be downloaded here.</Typography>
                  : null}</Stack>
              : null}
        </>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={() => controller.close()} disabled={locked}>Cancel</Button>
      {preview && <Button variant="contained" color="primary" onClick={() => void controller.restore()} disabled={controller.busy || locked}>Restore backup</Button>}
    </DialogActions>
  </Dialog>;
}
