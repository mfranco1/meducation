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
export interface PublishedVersion {
  releaseId: string;
  latestPublicationSequence: string;
}
export function AdminVersionsDialog({
  open,
  busy,
  error,
  versions,
  selected,
  hasNext,
  onSelect,
  onNext,
  onClose,
  onExport,
  onActivate,
}: {
  open: boolean;
  busy: boolean;
  error?: string;
  versions: PublishedVersion[];
  selected: string;
  hasNext: boolean;
  onSelect: (id: string) => void;
  onNext: () => void;
  onClose: () => void;
  onExport: () => void;
  onActivate: () => void;
}) {
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      fullScreen={narrow}
      aria-labelledby="versions-title"
    >
      <DialogTitle id="versions-title">Published versions</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>Using a published version changes learner content and preserves the saved draft.</Typography>
          {busy && <Typography role="status">Loading versions…</Typography>}
          {!error && !busy && !versions.length && <Alert severity="info">No published versions found.</Alert>}
          <TextField
            select
            label="Published version"
            value={selected}
            disabled={busy || !versions.length}
            onChange={(e) => onSelect(e.target.value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          >
            <option value="">Choose a version</option>
            {versions.map((v) => (
              <option key={v.releaseId} value={v.releaseId}>
                Publication {v.latestPublicationSequence} · {v.releaseId}
              </option>
            ))}
          </TextField>
          {hasNext && (
            <Button disabled={busy} onClick={onNext}>
              Next published versions
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button disabled={busy} onClick={onClose}>
          Close
        </Button>
        <Button disabled={busy || !selected} onClick={onExport}>
          Export content…
        </Button>
        <Button disabled={busy || !selected} onClick={onActivate}>
          Use this published version…
        </Button>
      </DialogActions>
    </Dialog>
  );
}
