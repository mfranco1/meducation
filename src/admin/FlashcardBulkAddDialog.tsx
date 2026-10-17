import { useAdminConfirmation } from './useAdminConfirmation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import type { StoredFlashcardBank } from '../content/schema/schema';
import {
  compileFlashcardBulkAddDraft,
  flashcardBulkAddTemplate,
  parseFlashcardBulkAddDraft,
  type FlashcardBulkAddContext,
  type FlashcardBulkDiagnostic,
} from './core/flashcardBulkAddDraft';
import type { BulkPlan } from './data/DraftStore';

/** Pasted JSON for new decks or cards. Save sends it to the server in bulk; the server assigns the IDs. */
export function FlashcardBulkAddDialog({
  context,
  destinationLabel,
  bank,
  topics,
  busy,
  onClose,
  onDraftDirtyChange,
  onSave,
}: {
  context: FlashcardBulkAddContext;
  destinationLabel: string;
  bank: StoredFlashcardBank;
  topics: readonly { id: string }[];
  busy: boolean;
  onClose: () => void;
  onDraftDirtyChange: (dirty: boolean) => void;
  /** Resolves to problem lines when the server refused the batch (nothing after the failing step is saved). */
  onSave: (plan: BulkPlan) => Promise<string[] | undefined>;
}) {
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const template = useMemo(() => flashcardBulkAddTemplate(context), [context]);
  const [text, setText] = useState(template);
  const [diagnostics, setDiagnostics] = useState<FlashcardBulkDiagnostic[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();
  const [loadingFile, setLoadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const draftDirty = text !== template;

  useEffect(() => {
    onDraftDirtyChange(draftDirty);
  }, [draftDirty, onDraftDirtyChange]);
  useEffect(() => () => onDraftDirtyChange(false), [onDraftDirtyChange]);

  const confirmation = useAdminConfirmation([text, busy]);
  const requestClose = async () => {
    if (busy) return;
    if (draftDirty && !(await confirmation.request('Discard the unsaved flashcard batch JSON?'))) return;
    generation.current++;
    onDraftDirtyChange(false);
    onClose();
  };
  const changed = (value: string) => {
    generation.current++;
    setText(value);
    setDiagnostics([]);
    setProblems([]);
    setMessage(undefined);
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    const token = ++generation.current;
    setLoadingFile(true);
    setMessage(undefined);
    try {
      const contents = await file.text();
      if (generation.current === token) changed(contents);
    } catch {
      if (generation.current === token) setMessage('Could not read that JSON file.');
    } finally {
      if (generation.current === token) setLoadingFile(false);
    }
  };
  const save = async () => {
    setMessage(undefined);
    setProblems([]);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      setDiagnostics([
        { level: 'error', path: '$', message: error instanceof Error ? error.message : 'invalid JSON.' },
      ]);
      return;
    }
    const parsed = parseFlashcardBulkAddDraft(value, context);
    if (!parsed.draft) {
      setDiagnostics(parsed.diagnostics);
      return;
    }
    const compiled = compileFlashcardBulkAddDraft(parsed.draft, context, bank, topics);
    setDiagnostics(compiled.diagnostics);
    if (!compiled.compiled) return;
    const version = generation.current;
    const failure = await onSave(compiled.compiled.plan);
    if (failure) setProblems(failure);
    else if (generation.current === version) {
      onDraftDirtyChange(false);
      onClose();
    } else setMessage('The captured batch was saved. Newer text is kept and was not sent.');
  };
  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setMessage('Template copied.');
    } catch {
      setMessage('Clipboard access is unavailable. Select and copy the template from the editor.');
    }
  };
  const errors = diagnostics.filter((issue) => issue.level === 'error');

  return (
    <Dialog
      open
      onClose={requestClose}
      fullScreen={narrow}
      fullWidth
      maxWidth="md"
      aria-labelledby="flashcard-bulk-title"
    >
      {confirmation.dialog}
      <DialogTitle id="flashcard-bulk-title">Add {context.kind === 'deck' ? 'Cards' : 'Decks'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">
            Destination · {destinationLabel}. Up to 1,000 cards per deck. Saving adds to the draft in order and does
            not publish.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button onClick={() => void copyTemplate()} disabled={busy || loadingFile}>
              Copy template
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={busy || loadingFile}>
              Load JSON file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                void loadFile(event.currentTarget.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </Stack>
          <TextField
            label="JSON"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ mt: 1 }}
            value={text}
            onChange={(event) => changed(event.target.value)}
            multiline
            minRows={14}
            maxRows={28}
            fullWidth
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
            disabled={busy || loadingFile}
          />
          {message && <Alert severity={message === 'Template copied.' ? 'success' : 'info'}>{message}</Alert>}
          {errors.length > 0 && (
            <Alert severity="error">
              <Stack spacing={0.5}>
                {errors.map((issue, index) => (
                  <Typography key={`${issue.path}-${index}`}>
                    {issue.path}: {issue.message}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          )}
          {problems.length > 0 && (
            <Alert severity="error">
              <Stack spacing={0.5}>
                {problems.map((line, index) => (
                  <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {line}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={requestClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy || loadingFile}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
