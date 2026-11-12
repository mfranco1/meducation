import { useEffect, useRef } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
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
  const rows = preview
    ? ([
        ['Quizzes', preview.summary.savedQuizzes, current?.savedQuizzes],
        ['Flashcard decks', preview.summary.savedFlashcardDecks, current?.savedFlashcardDecks],
        ['Completions', preview.summary.completions, current?.completions],
      ] as const)
    : [];

  const summary = controller.resetSummary;
  const nothingToReset =
    summary !== undefined &&
    summary.savedQuizzes === 0 &&
    summary.savedFlashcardDecks === 0 &&
    summary.completions === 0;
  const resetRows = summary
    ? ([
        ['Quizzes', summary.savedQuizzes],
        ['Flashcard decks', summary.savedFlashcardDecks],
        ['Completions', summary.completions],
      ] as const)
    : [];
  const messages = (
    <>
      {controller.busy && (
        <Typography role="status" aria-live="polite">
          {controller.status ?? 'Working with progress backup…'}
        </Typography>
      )}
      {!controller.busy && controller.notice && (
        <Stack
          direction="row"
          spacing={1}
          role="status"
          aria-live="polite"
          sx={{ alignItems: 'center', color: 'success.main' }}
        >
          <CheckCircleRoundedIcon fontSize="small" aria-hidden="true" />
          <Typography variant="body2">{controller.notice}</Typography>
        </Stack>
      )}
      {controller.error && (
        <Alert severity="warning" role="alert">
          {controller.error}
        </Alert>
      )}
    </>
  );

  return (
    <Dialog
      open={controller.open}
      onClose={() => {
        if (!locked) controller.close();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="progress-backup-title"
      aria-describedby="progress-backup-description"
      slotProps={{ paper: { 'aria-busy': controller.busy } }}
    >
      <DialogTitle id="progress-backup-title" sx={{ pr: 6, position: 'relative' }}>
        Progress
        <IconButton
          aria-label="Close progress"
          onClick={() => controller.close()}
          disabled={locked}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      {controller.resetStep ? (
        <>
          <DialogContent dividers>
            <Stack spacing={2}>
              {nothingToReset ? (
                <Typography id="progress-backup-description">There is no saved progress to reset.</Typography>
              ) : (
                <>
                  <Alert severity="error" id="progress-backup-description">
                    This deletes all quiz and flashcard progress in this browser. You cannot undo this.
                  </Alert>
                  {summary ? (
                    <Table size="small" aria-label="Progress to delete">
                      <TableBody>
                        {resetRows.map(([label, count]) => (
                          <TableRow key={label}>
                            <TableCell component="th" scope="row">
                              {label}
                            </TableCell>
                            <TableCell align="right">{count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Typography>Some saved progress could not be read. Resetting clears it.</Typography>
                  )}
                  <Box
                    component="section"
                    aria-labelledby="progress-reset-download"
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      justifyContent: 'space-between',
                      gap: 1.5,
                    }}
                  >
                    <Box>
                      <Typography id="progress-reset-download" variant="subtitle1">
                        Download backup
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        You might want this progress restored later
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      onClick={controller.download}
                      disabled={controller.busy || locked || !files.download}
                    >
                      Download
                    </Button>
                  </Box>
                </>
              )}
              {messages}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button autoFocus onClick={controller.cancelReset} disabled={locked}>
              Back
            </Button>
            {!nothingToReset && (
              <Button variant="contained" color="error" onClick={controller.reset} disabled={controller.busy || locked}>
                Reset
              </Button>
            )}
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography id="progress-backup-description" sx={{ color: 'text.secondary' }}>
                Your progress is saved in this browser only. Back it up to keep it safe or move it to another device.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={controller.download}
                  disabled={controller.busy || locked || !files.download}
                >
                  Download Backup
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => input.current?.click()}
                  disabled={controller.busy || locked || !files.read}
                >
                  Restore Backup
                </Button>
                <Box
                  component="input"
                  ref={input}
                  type="file"
                  accept=".gz,application/gzip"
                  aria-label="Choose progress backup file"
                  sx={{ display: 'none' }}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) void controller.chooseFile(file);
                  }}
                />
              </Stack>
              {(!files.read || !files.download) && (
                <Alert severity="warning">
                  This browser cannot {!files.read ? 'read selected' : 'download'} progress files. Use another supported
                  browser for that action.
                </Alert>
              )}
              {messages}
              {preview && (
                <>
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
                        {rows.map(([label, file, browser]) => (
                          <TableRow key={label}>
                            <TableCell component="th" scope="row">
                              {label}
                            </TableCell>
                            <TableCell align="right">{file}</TableCell>
                            {current && <TableCell align="right">{browser}</TableCell>}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                      Backup from{' '}
                      {new Date(preview.backup.exportedAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </Typography>
                  </Box>
                  <Alert severity="warning">
                    This replaces all quiz and flashcard progress in this browser. You cannot undo this.
                  </Alert>
                </>
              )}
              {!preview && (
                <>
                  <Divider />
                  <Box
                    component="section"
                    aria-labelledby="progress-reset"
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      justifyContent: 'space-between',
                      gap: 1.5,
                    }}
                  >
                    <Box>
                      <Typography id="progress-reset" variant="subtitle1">
                        Reset progress
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Delete all quiz and flashcard progress in this browser
                      </Typography>
                    </Box>
                    <Button
                      ref={resetEntry}
                      variant="outlined"
                      color="error"
                      onClick={controller.requestReset}
                      disabled={controller.busy || locked}
                    >
                      Reset
                    </Button>
                  </Box>
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => controller.close()} disabled={locked}>
              Cancel
            </Button>
            {preview && (
              <Button
                variant="contained"
                color="primary"
                onClick={controller.restore}
                disabled={controller.busy || locked}
              >
                Restore
              </Button>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
