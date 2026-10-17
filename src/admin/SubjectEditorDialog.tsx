import { useEffect, useRef } from 'react';
import {
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
import type { DraftStore } from './data/DraftStore';
import { useRecordEditor } from './useRecordEditor';
import { AdminRecordEditor } from './components/AdminRecordEditor';
import { AdminRecordFeedback } from './components/AdminRecordFeedback';

/** Subjects are shared by both banks; this editor never switches or clears either workspace. */
export function SubjectEditorDialog({
  store,
  initialId,
  blocked,
  onDirtyChange,
  onClose,
}: {
  store: DraftStore;
  initialId?: string;
  blocked: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const editor = useRecordEditor(store, { blocked, draftLabel: 'shared subject', fallback: () => undefined });
  const initialized = useRef(false);
  const editVersion = useRef(0);
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const subjects = store.quizBank.subjects;
  useEffect(() => {
    if (initialized.current || blocked) return;
    initialized.current = true;
    const subject = store.find('subject', initialId ?? '');
    if (subject) void editor.load({ kind: 'subject', id: subject.id }, subject);
    else void editor.loadNew('subject');
  });
  useEffect(() => {
    onDirtyChange(editor.dirty);
  }, [onDirtyChange, editor.dirty]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const close = async () => {
    if (editor.busy || (editor.dirty && !(await editor.discardDraft()))) return;
    onClose();
  };
  const save = async () => {
    const version = editVersion.current;
    if ((await editor.save()) && version === editVersion.current) onClose();
  };
  return (
    <>
      {editor.discardDialog}
      <Dialog open fullWidth fullScreen={narrow} aria-labelledby="subject-editor-title" onClose={() => void close()}>
        <DialogTitle id="subject-editor-title">Manage subjects</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Subjects are shared by quizzes and flashcards. Saving updates the draft; it does not publish.
            </Typography>
            <Autocomplete
              options={subjects}
              value={subjects.find((row) => row.id === editor.selection?.id) ?? null}
              getOptionLabel={(row) => `${row.name} · ${row.id}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              disabled={editor.busy || blocked}
              onChange={(_, row) => {
                if (row) void editor.load({ kind: 'subject', id: row.id }, row);
              }}
              renderInput={(params) => <TextField {...params} label="Saved subject" />}
            />
            <Button disabled={editor.busy || blocked} onClick={() => void editor.loadNew('subject')}>
              Add subject
            </Button>
            <Typography variant="subtitle2">
              {editor.selection?.id ? `Edit subject · ${editor.selection.id}` : 'New subject'}
            </Typography>
            <AdminRecordEditor
              kind="subject"
              existing={Boolean(editor.selection?.id)}
              expectedId={editor.selection?.id}
              text={editor.text}
              onChange={(value) => {
                editVersion.current++;
                editor.edit(value);
              }}
            />
            <AdminRecordFeedback
              issues={editor.issues}
              notice=""
              conflict={editor.conflict}
              busy={editor.busy}
              onUseServer={editor.takeServerVersion}
              onKeepMine={editor.keepMine}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button autoFocus disabled={editor.busy} onClick={() => void close()}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={editor.busy || blocked || !editor.text.trim()}
            onClick={() => void save()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
