import { useEffect, useRef } from 'react';
import SettingsBackupRestoreRoundedIcon from '@mui/icons-material/SettingsBackupRestoreRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ProgressBackupController } from '../useProgressBackup';
import { progressFileCapabilities } from '../progressBackupFiles';

export function ProgressBackupDialog({ controller }: { controller: ProgressBackupController }) {
  const input = useRef<HTMLInputElement>(null);
  const resetEntry = useRef<HTMLButtonElement>(null);
  const wasResetStep = useRef(false);
  useEffect(() => {
    if (wasResetStep.current && !controller.resetStep) resetEntry.current?.focus();
    wasResetStep.current = controller.resetStep;
  }, [controller.resetStep]);
  const preview = controller.preview;
  const locked = controller.committing;
  const files = progressFileCapabilities();
  const current = preview?.currentSummary;
  const rows = preview ? [
    ['Quizzes', preview.summary.savedQuizzes, current?.savedQuizzes],
    ['Flashcard decks', preview.summary.savedFlashcardDecks, current?.savedFlashcardDecks],
    ['Completions', preview.summary.completions, current?.completions],
  ] as const : [];

  const summary = controller.resetSummary;
  const nothingToReset = summary !== undefined && summary.savedQuizzes === 0 && summary.savedFlashcardDecks === 0 && summary.completions === 0;
  const resetRows = summary ? [
    ['Quizzes', summary.savedQuizzes],
    ['Flashcard decks', summary.savedFlashcardDecks],
    ['Completions', summary.completions],
  ] as const : [];
  const messages = <>
    {controller.busy && <Typography role="status" aria-live="polite">{controller.status ?? 'Working with progress backup…'}</Typography>}
    {!controller.busy && controller.notice && <Stack direction="row" spacing={0.75} role="status" aria-live="polite" sx={{ alignItems: 'center', color: 'success.main' }}>
      <CheckCircleRoundedIcon fontSize="small" aria-hidden="true" /><Typography variant="body2">{controller.notice}</Typography>
    </Stack>}
    {controller.error && <Alert severity="warning" role="alert">{controller.error}</Alert>}
  </>;

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
      <Box aria-hidden="true" sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: '12px', display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: theme => alpha(theme.palette.primary.main, 0.12) }}><SettingsBackupRestoreRoundedIcon /></Box>
      Progress
    </DialogTitle>
    {controller.resetStep ? <>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {nothingToReset ? <Typography id="progress-backup-description">There is no saved progress to reset.</Typography> : <>
            <Alert severity="error" id="progress-backup-description">This deletes all quiz and flashcard progress in this browser. You cannot undo this.</Alert>
            {summary
              ? <Table size="small" aria-label="Progress to delete">
                <TableBody>
                  {resetRows.map(([label, count]) => <TableRow key={label}>
                    <TableCell component="th" scope="row">{label}</TableCell>
                    <TableCell align="right">{count}</TableCell>
                  </TableRow>)}
                </TableBody>
              </Table>
              : <Typography>Some saved progress could not be read. Resetting clears it.</Typography>}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">Download a backup first if you might want this progress later.</Typography>
              <Button size="small" onClick={controller.download} disabled={controller.busy || locked || !files.download}>Download backup</Button>
            </Stack>
          </>}
          {messages}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={controller.cancelReset} disabled={locked}>Back</Button>
        {!nothingToReset && <Button variant="contained" color="error" onClick={controller.reset} disabled={controller.busy || locked}>Reset</Button>}
      </DialogActions>
    </> : <>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography id="progress-backup-description" color="text.secondary">Your progress is saved in this browser only. Back it up to keep it safe or move it to another device.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="contained" onClick={controller.download} disabled={controller.busy || locked || !files.download}>Download Backup</Button>
          <Button variant="outlined" onClick={() => input.current?.click()} disabled={controller.busy || locked || !files.read}>Restore Backup</Button>
          <Box component="input" ref={input} type="file" accept=".json,application/json" aria-label="Choose progress backup file" sx={{ display: 'none' }} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void controller.chooseFile(file);
          }} />
        </Stack>
        {(!files.read || !files.download) && <Alert severity="warning">This browser cannot {!files.read ? 'read selected' : 'download'} progress files. Use another supported browser for that action.</Alert>}
        {messages}
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
          <Alert severity="warning">This replaces all quiz and flashcard progress in this browser. You cannot undo this.</Alert>
        </>}
        {!preview && <>
          <Divider />
          <Box component="section" aria-labelledby="progress-reset" sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1.5 }}>
            <Box>
              <Typography id="progress-reset" variant="subtitle1" fontWeight={500}>Reset progress</Typography>
              <Typography variant="body2" color="text.secondary">Delete all quiz and flashcard progress in this browser.</Typography>
            </Box>
            <Button ref={resetEntry} variant="outlined" color="error" onClick={controller.requestReset} disabled={controller.busy || locked}>Reset progress</Button>
          </Box>
        </>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={() => controller.close()} disabled={locked}>Cancel</Button>
      {preview && <Button variant="contained" color="primary" onClick={controller.restore} disabled={controller.busy || locked}>Restore</Button>}
    </DialogActions>
    </>}
  </Dialog>;
}
