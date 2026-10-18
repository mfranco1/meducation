import { useRef } from 'react';
import BackupRoundedIcon from '@mui/icons-material/BackupRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ProgressBackupController } from '../useProgressBackup';
import { progressFileCapabilities } from '../progressBackupFiles';

function replaceWarning(controller: ProgressBackupController): string | undefined {
  const preview = controller.preview;
  if (!preview) return undefined;
  const { savedQuizzes, savedFlashcardDecks } = preview.summary;
  const message = savedQuizzes === 0 && savedFlashcardDecks === 0
    ? 'This backup has no saved progress. Replacing clears all quiz and flashcard progress in this browser.'
    : savedQuizzes === 0
      ? 'This backup has no quiz progress. Replacing clears current quiz progress in this browser.'
      : savedFlashcardDecks === 0
        ? 'This backup has no flashcard progress. Replacing clears current flashcard progress in this browser.'
        : 'Replacing swaps all quiz and flashcard progress in this browser for this file. Nothing is merged.';
  return preview.currentProgressIssue ? `${message} Some progress in this browser could not be read and will be lost.` : message;
}

const cardSx = { flex: 1, minWidth: 0, p: 2, border: 1, borderColor: 'divider', borderRadius: '14px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5 };

export function ProgressBackupDialog({ controller }: { controller: ProgressBackupController }) {
  const input = useRef<HTMLInputElement>(null);
  const preview = controller.preview;
  const warning = replaceWarning(controller);
  const locked = controller.committing;
  const files = progressFileCapabilities();
  const current = preview?.currentSummary;
  const rows = preview ? [
    ['Quizzes', preview.summary.savedQuizzes, current?.savedQuizzes],
    ['Flashcard decks', preview.summary.savedFlashcardDecks, current?.savedFlashcardDecks],
    ['Completions', preview.summary.completions, current?.completions],
  ] as const : [];

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
    <DialogTitle id="progress-backup-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box aria-hidden="true" sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: theme => alpha(theme.palette.primary.main, 0.12) }}><BackupRoundedIcon /></Box>
      Progress backup
    </DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography id="progress-backup-description" color="text.secondary">Your progress lives in this browser. Save a copy to keep it safe or move it.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Box component="section" aria-labelledby="progress-backup-save" sx={cardSx}>
            <Box>
              <Typography id="progress-backup-save" variant="subtitle1" fontWeight={700}>Save a copy</Typography>
              <Typography variant="body2" color="text.secondary">Download a small file you can keep.</Typography>
            </Box>
            <Button variant="contained" onClick={controller.download} disabled={controller.busy || locked || !files.download} sx={{ mt: 'auto' }}>Download backup</Button>
          </Box>
          <Box component="section" aria-labelledby="progress-backup-restore" sx={cardSx}>
            <Box>
              <Typography id="progress-backup-restore" variant="subtitle1" fontWeight={700}>Restore from a file</Typography>
              <Typography variant="body2" color="text.secondary">Replaces progress in this browser.</Typography>
            </Box>
            <Button variant="outlined" onClick={() => input.current?.click()} disabled={controller.busy || locked || !files.read} sx={{ mt: 'auto' }}>Choose file</Button>
            <Box component="input" ref={input} type="file" accept=".json,application/json" aria-label="Choose progress backup file" sx={{ display: 'none' }} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void controller.chooseFile(file);
            }} />
          </Box>
        </Stack>
        {(!files.read || !files.download) && <Alert severity="warning">This browser cannot {!files.read ? 'read selected' : 'download'} progress files. Use another supported browser for that action.</Alert>}
        {controller.busy && <Typography role="status" aria-live="polite">{controller.status ?? 'Working with progress backup…'}</Typography>}
        {!controller.busy && controller.notice && <Stack direction="row" spacing={0.75} role="status" aria-live="polite" sx={{ alignItems: 'center', color: 'success.main' }}>
          <CheckCircleRoundedIcon fontSize="small" aria-hidden="true" /><Typography variant="body2">{controller.notice}</Typography>
        </Stack>}
        {controller.error && <Alert severity="warning" role="alert">{controller.error}</Alert>}
        {preview && <>
          <Box>
            <Table size="small" aria-label="Backup comparison">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell align="right">This file</TableCell>
                  {current && <TableCell align="right">This browser</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(([label, file, browser]) => <TableRow key={label}>
                  <TableCell component="th" scope="row">{label}</TableCell>
                  <TableCell align="right">{file}</TableCell>
                  {current && <TableCell align="right">{browser}</TableCell>}
                </TableRow>)}
              </TableBody>
            </Table>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Backup from {new Date(preview.backup.exportedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Typography>
          </Box>
          <Alert severity="warning" action={preview.currentBackup
            ? <Button color="inherit" size="small" onClick={controller.downloadCurrent} disabled={controller.busy || locked || !files.download}>Download current progress first</Button>
            : undefined}>{warning}</Alert>
        </>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={() => controller.close()} disabled={locked}>Cancel</Button>
      {preview && <Button variant="contained" color="primary" onClick={controller.restore} disabled={controller.busy || locked}>Replace my progress</Button>}
    </DialogActions>
  </Dialog>;
}
