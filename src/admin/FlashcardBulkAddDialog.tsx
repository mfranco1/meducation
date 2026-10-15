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
import { serializeFlashcardBank } from './core/flashcardSerialization';
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
  exportContext,
  busy,
  onClose,
  onDraftDirtyChange,
  onStage,
  commitLabel = 'Save draft',
}: {
  open: boolean;
  context: FlashcardBulkAddContext;
  destinationLabel: string;
  bank: StoredFlashcardBank;
  subjects: readonly Subject[];
  reason: string;
  exportContext: string;
  busy: boolean;
  onClose: () => void;
  onDraftDirtyChange: (dirty: boolean) => void;
  commitLabel?: string;
  onStage: (
    operations: readonly FlashcardAdminOperation[],
    snapshot: FlashcardBulkPreviewSnapshot,
  ) => string | undefined | Promise<string | undefined>;
}) {
  const template = useMemo(() => flashcardBulkAddTemplate(context), [context]);
  const [text, setText] = useState(template);
  const [preview, setPreview] = useState<Preview>();
  const [diagnostics, setDiagnostics] = useState<CompiledFlashcardBulkAdd['diagnostics']>([]);
  const [message, setMessage] = useState<string>();
  const [loadingFile, setLoadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const draftDirty = text !== template;
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
    setPreview(undefined);
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

  const stage = async () => {
    if (!previewCurrent || !preview) return;
    const error = await onStage(preview.compiled.operations, preview.snapshot);
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
      <DialogTitle id="flashcard-bulk-title">Add {context.kind === 'deck' ? 'Cards' : 'Decks'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Destination · {destinationLabel}
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
              The bank, subjects, destination, draft context changed. Preview again before saving.
            </Alert>
          )}
          {previewCurrent && preview && <PaperPreview preview={preview} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={requestClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={previewCurrent ? stage : previewDraft}
          disabled={busy || loadingFile || (previewCurrent && errors.length > 0)}
        >
          {previewCurrent ? commitLabel : 'Preview'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PaperPreview({ preview }: { preview: Preview }) {
  const [deckPage, setDeckPage] = useState(0);
  const [cardPage, setCardPage] = useState(0);
  useEffect(() => {
    setDeckPage(0);
    setCardPage(0);
  }, [preview.key]);
  const cardCount = preview.compiled.deckSummaries.reduce((total, deck) => total + deck.cardCount, 0);
  const deck = preview.compiled.deckSummaries[deckPage];
  const visibleCards = deck?.cards.slice(cardPage * 25, (cardPage + 1) * 25) ?? [];
  const pageCount = deck ? Math.max(1, Math.ceil(deck.cards.length / 25)) : 1;
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
        {deck && (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2">
                {deck.name} · {deck.cardCount} card(s) · {deck.id}
              </Typography>
              {preview.compiled.deckSummaries.length > 1 && (
                <Stack direction="row">
                  <Button
                    size="small"
                    disabled={!deckPage}
                    onClick={() => {
                      setDeckPage((page) => Math.max(0, page - 1));
                      setCardPage(0);
                    }}
                  >
                    Previous deck
                  </Button>
                  <Button
                    size="small"
                    disabled={deckPage + 1 >= preview.compiled.deckSummaries.length}
                    onClick={() => {
                      setDeckPage((page) => Math.min(preview.compiled.deckSummaries.length - 1, page + 1));
                      setCardPage(0);
                    }}
                  >
                    Next deck
                  </Button>
                </Stack>
              )}
            </Stack>
            <Box key={deck.id} sx={{ maxHeight: 360, overflow: 'auto' }}>
              {visibleCards.map((card, index) => (
                <Typography
                  key={card.id}
                  component="pre"
                  variant="caption"
                  sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pl: 2, my: 0.5 }}
                >
                  {`${cardPage * 25 + index + 1}. ${card.id}\nFront: ${card.front}\nBack: ${card.back}${card.sources === undefined ? '' : `\nSources: ${card.sources}`}${card.reviewNote === undefined ? '' : `\nReview note: ${card.reviewNote}`}`}
                </Typography>
              ))}
            </Box>
            {deck.cards.length > 25 && (
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="caption">
                  {cardPage * 25 + 1}–{Math.min(deck.cards.length, (cardPage + 1) * 25)} of {deck.cards.length} cards
                </Typography>
                <Stack direction="row">
                  <Button
                    size="small"
                    disabled={!cardPage}
                    onClick={() => setCardPage((page) => Math.max(0, page - 1))}
                  >
                    Previous cards
                  </Button>
                  <Button
                    size="small"
                    disabled={cardPage + 1 >= pageCount}
                    onClick={() => setCardPage((page) => Math.min(pageCount - 1, page + 1))}
                  >
                    Next cards
                  </Button>
                </Stack>
              </Stack>
            )}
          </>
        )}
        <Typography variant="caption" color="text.secondary">
          Temporary draft IDs · {preview.compiled.generatedIds.length} total.{' '}
          {preview.compiled.generatedIds.slice(0, 10).join(', ')}
        </Typography>
        {preview.compiled.generatedIds.length > 10 && (
          <details>
            <summary>Review all draft IDs</summary>
            <Typography
              component="pre"
              variant="caption"
              sx={{ maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {preview.compiled.generatedIds.join('\n')}
            </Typography>
          </details>
        )}
        <Typography variant="caption" color="text.secondary">
          Saving creates one paired draft revision containing {preview.compiled.operations.length} operation(s). Saving
          does not publish.
        </Typography>
      </Stack>
    </Box>
  );
}
