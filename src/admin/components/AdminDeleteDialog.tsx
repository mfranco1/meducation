import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema/schema';
interface DeletionTarget {
  kind: 'subject' | 'quiz' | 'question' | 'deck' | 'card';
  id?: string;
  parentId?: string;
}

/** Full impact is computed before paging; display filtering never changes the batch. */
export function deletionReview(bank: StoredQuestionBank, flashcards: StoredFlashcardBank, target: DeletionTarget, ids?: readonly string[]) {
  const selected = new Set(ids ?? (target.id ? [target.id] : []));
  const subjects = target.kind === 'subject' ? bank.subjects.filter(row => selected.has(row.id)) : [];
  const subjectIds = new Set(subjects.map(row => row.id));
  const quizzes = bank.quizzes.filter(row => target.kind === 'quiz' ? selected.has(row.id) : subjectIds.has(row.subjectId));
  const quizIds = new Set(quizzes.map(row => row.id));
  const questions = bank.questions.filter(row => target.kind === 'question' ? selected.has(row.id) : quizIds.has(row.quizId));
  const decks = flashcards.decks.filter(row => target.kind === 'deck' ? selected.has(row.id) : subjectIds.has(row.subjectId));
  const deckIds = new Set(decks.map(row => row.id));
  const cards = flashcards.cards.filter(row => target.kind === 'card' ? selected.has(row.id) : deckIds.has(row.deckId));
  const records = [
    ...subjects.map(row => `Subject · ${row.name} · ${row.id}`),
    ...quizzes.map(row => `Quiz · ${row.name} · ${row.id}`),
    ...questions.map(row => `Item · ${row.id}`),
    ...decks.map(row => `Deck · ${row.name} · ${row.id}`),
    ...cards.map(row => `Card · ${row.id}`),
  ];
  return { records, summary: `${subjects.length} subjects · ${quizzes.length} quizzes · ${questions.length} items · ${decks.length} decks · ${cards.length} cards` };
}

export interface DeleteRequest {
  selection: DeletionTarget;
  label: string;
  ids?: string[];
  reviewKey?: string;
}

export function AdminDeleteDialog({
  request,
  recovery,
  bank,
  flashcardBank,
  error,
  currentReviewKey,
  busy = false,
  commitLabel = 'Save',
  onClose,
  onConfirm,
}: {
  request?: DeleteRequest;
  recovery?: ReactNode;
  bank: StoredQuestionBank;
  flashcardBank: StoredFlashcardBank;
  error?: string;
  currentReviewKey?: string;
  busy?: boolean;
  commitLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [showRecords, setShowRecords] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
    setShowRecords(false);
  }, [request]);
  const selection = request?.selection ?? { kind: 'subject' as const };
  const { records, summary } = request
    ? deletionReview(bank, flashcardBank, selection, request.ids)
    : { records: [], summary: '' };
  const stale = request?.reviewKey !== undefined && request.reviewKey !== currentReviewKey;
  const name = selection.kind === 'question' ? 'item' : selection.kind;
  const action = request?.ids ? `selected ${name}s` : name;
  return (
    <Dialog
      open={Boolean(request)}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="admin-delete-title"
      slotProps={{ transition: { onEntered: () => cancelRef.current?.focus() } }}
    >
      <DialogTitle id="admin-delete-title">Delete {action}?</DialogTitle>
      <DialogContent>
        {recovery}
        <Stack spacing={1.5}>
          <Typography>
            {request?.label}
            {selection.id ? ` · ${selection.id}` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This deletion saves a paired draft in PostgreSQL. Use Undo saved batch to restore it. Saving does not
            publish. Saved learner progress remains stored, but references to removed content may no longer be
            accessible.
          </Typography>
          <Typography variant="body2">Affected: {summary}.</Typography>
          {stale && (
            <Alert severity="error">
              The content changed during this review. Cancel and review the deletion again.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {records.length > 0 && (
            <>
              <Button size="small" onClick={() => setShowRecords((value) => !value)} aria-expanded={showRecords}>
                {showRecords ? 'Hide affected records' : `Review affected records (${records.length})`}
              </Button>
              {showRecords && (
                <>
                  <Stack sx={{ maxHeight: 220, overflow: 'auto' }} spacing={0.5}>
                    {records.slice(page * 25, (page + 1) * 25).map((record) => (
                      <Typography key={record} variant="caption">
                        {record}
                      </Typography>
                    ))}
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption">
                      {page * 25 + 1}–{Math.min(records.length, (page + 1) * 25)} of {records.length}
                    </Typography>
                    <Stack direction="row">
                      <Button size="small" disabled={!page} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                        Previous
                      </Button>
                      <Button
                        size="small"
                        disabled={(page + 1) * 25 >= records.length}
                        onClick={() => setPage((value) => Math.min(Math.floor((records.length - 1) / 25), value + 1))}
                      >
                        Next
                      </Button>
                    </Stack>
                  </Stack>
                </>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button ref={cancelRef} autoFocus disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button color="error" variant="contained" disabled={busy || stale || !records.length} onClick={onConfirm}>
          {commitLabel} {action} deletion
        </Button>
      </DialogActions>
    </Dialog>
  );
}
