import type { ReactNode } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import type { PairedSnapshot } from '../data/PairedHttpClient';
export interface DraftHistoryReview {
  action: 'undo' | 'reset';
  snapshot: PairedSnapshot;
}
export function AdminDraftHistoryDialog({
  review,
  recovery,
  busy,
  blocked = false,
  stale,
  error,
  onCancel,
  onConfirm,
}: {
  review?: DraftHistoryReview;
  recovery?: ReactNode;
  busy: boolean;
  blocked?: boolean;
  stale: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  return (
    <Dialog
      open={Boolean(review)}
      onClose={busy ? undefined : onCancel}
      fullWidth
      fullScreen={narrow}
      aria-labelledby="draft-history-title"
    >
      <DialogTitle id="draft-history-title">
        {review?.action === 'undo' ? 'Undo last saved change' : 'Reset draft to published version'}
      </DialogTitle>
      <DialogContent>
        {recovery}
        {review && (
          <Stack spacing={2}>
            <Typography>
              {review.action === 'undo'
                ? `Restore both draft banks from revision ${review.snapshot.draft.revision} to saved snapshot ${review.snapshot.undo.targetRevision}.`
                : `Replace both draft banks at revision ${review.snapshot.draft.revision} with publication ${review.snapshot.publication.sequence}. Displaced saved content is retained in history.`}
            </Typography>
            <Typography>
              This changes the saved quizzes and flashcards together. It does not publish. Unsaved editor text in both
              sections is kept for review.
            </Typography>
            {stale && <Alert severity="warning">The context changed. Cancel and review this action again.</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button autoFocus disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={busy || blocked || stale} onClick={onConfirm}>
          {review?.action === 'undo' ? 'Undo saved change' : 'Reset draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
