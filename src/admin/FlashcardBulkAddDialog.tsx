import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Subject } from '../domain/types';
import type { StoredFlashcardBank } from '../content/schema/schema';
import { serializeFlashcardBank } from '../content/local/flashcardBank';
import {
  compileFlashcardBulkAddDraft,
  flashcardBulkAddTemplate,
  parseFlashcardBulkAddDraft,
  type CompiledFlashcardBulkAdd,
  type FlashcardBulkAddContext,
} from './core/flashcardBulkAddDraft';
import type { FlashcardAdminOperation } from './core/flashcardChangeSet';

export interface FlashcardBulkPreviewSnapshot {
  bankJson: string;
  subjectSnapshot: string;
  destination: string;
  reason: string;
  exportContext: string;
}

interface Preview {
  compiled: CompiledFlashcardBulkAdd;
  snapshot: FlashcardBulkPreviewSnapshot;
  key: string;
}

function flashcardBulkPreviewKey(
  bank: StoredFlashcardBank,
  subjects: readonly Subject[],
  context: FlashcardBulkAddContext,
  text: string,
  reason: string,
  exportContext: string,
): string {
  return JSON.stringify([serializeFlashcardBank(bank), JSON.stringify(subjects), context, text, reason, exportContext]);
}

export function FlashcardBulkAddDialog({
  open,
  context,
  destinationLabel,
  bank,
  subjects,
  reason,
  onReasonChange,
  exportContext,
  busy,
  onClose,
  onDraftDirtyChange,
  onStage,
}: {
  open: boolean;
  context: FlashcardBulkAddContext;
  destinationLabel: string;
  bank: StoredFlashcardBank;
  subjects: readonly Subject[];
  reason: string;
  onReasonChange: (reason: string) => void;
  exportContext: string;
  busy: boolean;
  onClose: () => void;
  onDraftDirtyChange: (dirty: boolean) => void;
  onStage: (
    operations: readonly FlashcardAdminOperation[],
    snapshot: FlashcardBulkPreviewSnapshot,
  ) => string | undefined;
}) {
  const template = useMemo(() => flashcardBulkAddTemplate(context), [context]);
  const [text, setText] = useState(template);
  const [initialReason] = useState(reason);
  const [preview, setPreview] = useState<Preview>();
  const [diagnostics, setDiagnostics] = useState<CompiledFlashcardBulkAdd['diagnostics']>([]);
  const [message, setMessage] = useState<string>();
  const [loadingFile, setLoadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const draftDirty = text !== template || reason !== initialReason;
  const snapshot: FlashcardBulkPreviewSnapshot = {
    bankJson: serializeFlashcardBank(bank),
    subjectSnapshot: JSON.stringify(subjects),
    destination: JSON.stringify(context),
    reason,
    exportContext,
  };
  const previewKey = flashcardBulkPreviewKey(bank, subjects, context, text, reason, exportContext);
  const previewCurrent = preview?.key === previewKey;

  useEffect(() => {
    onDraftDirtyChange(draftDirty);
  }, [draftDirty, onDraftDirtyChange]);
  useEffect(() => () => onDraftDirtyChange(false), [onDraftDirtyChange]);

  const requestClose = () => {
    generation.current++;
    if (draftDirty && !window.confirm('Discard the unstaged bulk JSON draft?')) return;
    onDraftDirtyChange(false);
    onClose();
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    const token = ++generation.current;
    setLoadingFile(true);
    setMessage(undefined);
    try {
      const contents = await file.text();
      if (generation.current !== token) return;
      setText(contents);
      setPreview(undefined);
      setDiagnostics([]);
    } catch {
      if (generation.current === token) setMessage('Could not read that JSON file.');
    } finally {
      if (generation.current === token) setLoadingFile(false);
    }
  };

  const previewDraft = () => {
    setPreview(undefined);
    setMessage(undefined);
    setDiagnostics([]);
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
    const compiled = compileFlashcardBulkAddDraft(parsed.draft, context, bank, subjects);
    setDiagnostics(compiled.diagnostics);
    if (!compiled.compiled) return;
    setPreview({ compiled: compiled.compiled, snapshot, key: previewKey });
  };

  const stage = () => {
    if (!previewCurrent || !preview) return;
    const error = onStage(preview.compiled.operations, preview.snapshot);
    if (error) {
      setPreview(undefined);
      setMessage(error);
    }
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
  const warnings = diagnostics.filter((issue) => issue.level === 'warning');
  const previewIsStale = Boolean(preview && !previewCurrent);

  return (
    <Dialog open={open} onClose={requestClose} fullWidth maxWidth="md" aria-labelledby="flashcard-bulk-title">
      <DialogTitle id="flashcard-bulk-title">Bulk add {context.kind === 'deck' ? 'cards' : 'decks'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            Destination: {destinationLabel}. IDs and parent references are assigned by the admin.
          </Alert>
          <TextField
            label="Change reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            required
            fullWidth
          />
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
            label="Bulk JSON"
            value={text}
            onChange={(event) => {
              generation.current++;
              setText(event.target.value);
              setDiagnostics([]);
              setMessage(undefined);
            }}
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
          {warnings.length > 0 && (
            <Alert severity="warning">
              <Stack spacing={0.5}>
                {warnings.map((issue, index) => (
                  <Typography key={`${issue.path}-${index}`}>
                    {issue.path}: {issue.message}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          )}
          {previewIsStale && (
            <Alert severity="warning">
              The bank, subjects, destination, draft, reason, or export context changed. Preview again before staging.
            </Alert>
          )}
          {previewCurrent && preview && <PaperPreview preview={preview} context={context} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={requestClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="outlined" onClick={previewDraft} disabled={busy || loadingFile || !reason.trim()}>
          Preview
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={stage}
          disabled={busy || !previewCurrent || errors.length > 0}
        >
          Stage batch
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PaperPreview({ preview, context }: { preview: Preview; context: FlashcardBulkAddContext }) {
  const cardCount = preview.compiled.deckSummaries.reduce((total, deck) => total + deck.cardCount, 0);
  return (
    <Box
      component="section"
      aria-label="Bulk add preview"
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}
    >
      <Stack spacing={1}>
        <Typography variant="h6">
          Preview · {preview.compiled.deckSummaries.length} deck(s) · {cardCount} card(s)
        </Typography>
        {context.kind === 'deck' && (
          <Typography variant="body2">Cards will be appended to the selected deck.</Typography>
        )}
        {preview.compiled.deckSummaries.map((deck) => (
          <Box key={deck.id}>
            <Typography variant="subtitle2">
              {deck.name} · {deck.cardCount} card(s) · {deck.id}
            </Typography>
            {deck.cards.map((card, index) => (
              <Typography
                key={card.id}
                component="pre"
                variant="caption"
                sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pl: 2, my: 0.5 }}
              >
                {`${index + 1}. ${card.id}\nFront: ${card.front}\nBack: ${card.back}${card.sources === undefined ? '' : `\nSources: ${card.sources}`}${card.reviewNote === undefined ? '' : `\nReview note: ${card.reviewNote}`}`}
              </Typography>
            ))}
          </Box>
        ))}
        <Typography variant="caption" color="text.secondary">
          Generated IDs: {preview.compiled.generatedIds.join(', ')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Staging creates one undoable batch containing {preview.compiled.operations.length} operation(s).
        </Typography>
      </Stack>
    </Box>
  );
}
