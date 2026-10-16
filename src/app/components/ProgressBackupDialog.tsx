import { useRef } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { ProgressBackupController } from '../useProgressBackup';
import { progressFileCapabilities } from '../progressBackupFiles';

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
  const locked = controller.committing;
  const files = progressFileCapabilities();

  return <Dialog
    open={controller.open}
    onClose={() => controller.close()}
    disableEscapeKeyDown={locked}
    fullWidth
    maxWidth="sm"
    aria-labelledby="progress-backup-title"
    aria-describedby="progress-backup-description"
    slotProps={{ paper: { 'aria-busy': controller.busy } }}
  >
    <DialogTitle id="progress-backup-title">Progress backup</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography id="progress-backup-description">
          Your progress is saved in this browser. Clearing site data removes it; backups let you keep a copy or move progress to another browser. Backups can include question content for unfinished quizzes, so share them only if you intend to share that data.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" onClick={controller.download} disabled={controller.busy || locked || !files.download}>Download backup</Button>
          <Button variant="outlined" onClick={() => input.current?.click()} disabled={controller.busy || locked || !files.read}>Choose backup file</Button>
          <Box component="input" ref={input} type="file" accept=".json,application/json" aria-label="Choose progress backup file" sx={{ display: 'none' }} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void controller.chooseFile(file);
          }} />
        </Stack>
        {(!files.read || !files.download) && <Alert severity="warning">This browser cannot {!files.read ? 'read selected' : 'download'} progress files. Use another supported browser for that action.</Alert>}
        {controller.busy && <Typography role="status" aria-live="polite">{controller.status ?? 'Working with progress backup…'}</Typography>}
        {controller.error && <Alert severity="warning" role="alert">{controller.error}</Alert>}
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
            ? <Button variant="text" onClick={controller.downloadCurrent} disabled={controller.busy || locked || !files.download}>Download current backup first</Button>
            : preview.currentProgressIssue
              ? <Alert severity="warning">Some saved progress could not be read. Restoring this backup will replace it.</Alert>
              : null}
        </>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={() => controller.close()} disabled={locked}>Cancel</Button>
      {preview && <Button variant="contained" color="primary" onClick={controller.restore} disabled={controller.busy || locked}>Restore backup</Button>}
    </DialogActions>
  </Dialog>;
}
