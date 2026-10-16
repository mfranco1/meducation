import { useRef } from 'react';
import {
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
import type { PreparedSaveReview } from '../data/HttpQuestionBankGateway';
import { AdminImpactSummary } from './AdminImpactSummary';
export function AdminSaveReviewDialog({
  review,
  onConfirm,
  onCancel,
}: {
  review?: PreparedSaveReview;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={Boolean(review)}
      onClose={onCancel}
      fullWidth
      fullScreen={narrow}
      aria-labelledby="save-review-title"
      slotProps={{ transition: { onEntered: () => cancelRef.current?.focus() } }}
    >
      <DialogTitle id="save-review-title">Review draft save</DialogTitle>
      <DialogContent>
        {review && (
          <Stack spacing={2}>
            <Typography>
              Save quizzes and flashcards to the database draft. Learners continue to see the published version.
            </Typography>
            <Typography>Change reason: {review.reason}</Typography>
            <Typography variant="body2">
              Draft {review.expected.draftRevision} · publication {review.expected.publicationSequence}
            </Typography>
            <AdminImpactSummary preview={review.impact} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button ref={cancelRef} autoFocus onClick={onCancel}>
          Keep editing
        </Button>
        <Button variant="contained" onClick={onConfirm}>
          Save draft
        </Button>
      </DialogActions>
    </Dialog>
  );
}
