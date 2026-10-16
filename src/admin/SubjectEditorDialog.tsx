import { useEffect, useRef } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import type { HttpQuestionBankGateway } from './data/HttpQuestionBankGateway';
import { useAdminEditor } from './useAdminEditor';
import { AdminRecordEditor } from './components/AdminRecordEditor';
import { AdminIssues } from './components/AdminIssues';

/** Subjects are shared by both banks; this editor never switches or clears either workspace. */
export function SubjectEditorDialog({
  gateway,
  initialId,
  blocked,
  recovery,
  onDirtyChange,
  onClose,
}: {
  gateway: HttpQuestionBankGateway;
  initialId?: string;
  blocked: boolean;
  recovery?: React.ReactNode;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const state = useAdminEditor(gateway, { blocked, draftLabel: 'shared subject' });
  const initialized = useRef(false);
  const editVersion = useRef(0);
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  useEffect(() => {
    if (!state.snapshot || initialized.current || blocked) return;
    initialized.current = true;
    const subject = state.snapshot.bank.subjects.find((row) => row.id === initialId);
    if (subject) void state.loadEntity({ kind: 'subject', id: subject.id }, subject);
    else state.loadNew('subject');
  }, [initialId, blocked, state]);
  useEffect(() => {
    onDirtyChange(state.editorDirty);
  }, [onDirtyChange, state.editorDirty]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const close = async () => {
    if (state.busy || (state.editorDirty && !(await state.discardDraft()))) return;
    onClose();
  };
  const save = async () => {
    const version = editVersion.current;
    const saved = await state.stageSingle();
    if (saved === true && version === editVersion.current) onClose();
  };
  return (
    <>
      {state.discardDialog}
      <Dialog open fullWidth fullScreen={narrow} aria-labelledby="subject-editor-title" onClose={() => void close()}>
        <DialogTitle id="subject-editor-title">Manage subjects</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {recovery}
            <Typography variant="body2">
              Subjects are shared by quizzes and flashcards. Saving updates the paired draft.
            </Typography>
            <Autocomplete
              options={state.snapshot?.bank.subjects ?? []}
              value={state.snapshot?.bank.subjects.find((row) => row.id === state.selection.id) ?? null}
              getOptionLabel={(row) => `${row.name} · ${row.id}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              disabled={Boolean(state.busy) || blocked}
              onChange={(_, row) => {
                if (row) void state.loadEntity({ kind: 'subject', id: row.id }, row);
              }}
              renderInput={(params) => <TextField {...params} label="Saved subject" />}
            />
            <Button disabled={Boolean(state.busy) || blocked} onClick={() => state.loadNew('subject')}>
              Add subject
            </Button>
            <Typography variant="subtitle2">
              {state.selection.id ? `Edit subject · ${state.selection.id}` : 'New subject'}
            </Typography>
            <AdminRecordEditor
              kind="subject"
              existing={Boolean(state.selection.id)}
              expectedId={state.selection.id}
              text={state.editor}
              onChange={(value) => {
                editVersion.current++;
                state.editRecord(value);
              }}
            />
            <TextField
              label="Change reason"
              required
              value={state.reason}
              onChange={(event) => {
                editVersion.current++;
                state.editReason(event.target.value);
              }}
            />
            {state.loadError && <Alert severity="error">{state.loadError}</Alert>}
            {state.issues.length > 0 && <AdminIssues issues={state.issues} />}
            {state.summary && (
              <Typography role="status" variant="body2">
                {state.summary}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button autoFocus disabled={Boolean(state.busy)} onClick={() => void close()}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={Boolean(state.busy) || blocked || !state.editor.trim()}
            onClick={() => void save()}
          >
            Review save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
