import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
export type ExportTarget = 'draft' | 'current' | 'selected';
export function AdminExportDialog({
  open,
  busy,
  error,
  currentReleaseId,
  selectedReleaseId,
  draftRevision,
  initialTarget = 'draft',
  onClose,
  onExport,
}: {
  initialTarget?: ExportTarget;
  open: boolean;
  busy: boolean;
  error?: string;
  currentReleaseId: string | null;
  selectedReleaseId: string;
  draftRevision: string;
  onClose: () => void;
  onExport: (target: ExportTarget) => void;
}) {
  const [target, setTarget] = useState<ExportTarget>(initialTarget);
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const release = target === 'current' ? currentReleaseId : selectedReleaseId;
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      fullScreen={narrow}
      aria-labelledby="export-title"
    >
      <DialogTitle id="export-title">Export content</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="info">
            Exports contain both saved banks. Unsaved editor text is excluded. This is not a full database backup.
          </Alert>
          <TextField
            select
            label="Export target"
            value={target}
            onChange={(e) => setTarget(e.target.value as ExportTarget)}
            disabled={busy}
          >
            <MenuItem value="draft">Saved draft</MenuItem>
            <MenuItem value="current" disabled={!currentReleaseId}>
              Current published version
            </MenuItem>
            <MenuItem value="selected" disabled={!selectedReleaseId}>
              Selected published version
            </MenuItem>
          </TextField>
          <Typography sx={{ overflowWrap: 'anywhere' }}>
            {target === 'draft'
              ? `Saved draft ${draftRevision}`
              : `Published version ${release || 'Choose a version in Published versions first'}`}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || (target !== 'draft' && !release)} onClick={() => onExport(target)}>
          Export paired ZIP
        </Button>
      </DialogActions>
    </Dialog>
  );
}
