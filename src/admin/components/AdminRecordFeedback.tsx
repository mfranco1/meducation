import { Alert, Button, Stack, Typography } from '@mui/material';
import { toRecordText } from '../core/recordDraft';
import type { StoredRecord } from '../data/DraftStore';

/** Save outcome for the open record: server issues, a version conflict with the server's copy, or a notice. */
export function AdminRecordFeedback({
  issues,
  notice,
  conflict,
  busy,
  onUseServer,
  onKeepMine,
}: {
  issues: string[];
  notice: string;
  conflict?: StoredRecord;
  busy: boolean;
  onUseServer: () => void;
  onKeepMine: () => void;
}) {
  return (
    <Stack spacing={1}>
      {conflict && (
        <Alert
          severity="warning"
          action={
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
              <Button color="inherit" disabled={busy} onClick={onKeepMine}>
                Keep my text
              </Button>
              <Button color="inherit" disabled={busy} onClick={onUseServer}>
                Use server version
              </Button>
            </Stack>
          }
        >
          <Typography variant="body2">
            This record changed on the server after you opened it. Your unsaved text is kept. Choose Keep my text to
            save your changes over the server version, or use the server version instead.
          </Typography>
          <details>
            <summary>Server version</summary>
            <Typography
              component="pre"
              variant="caption"
              aria-label="Server version"
              sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 240, overflow: 'auto' }}
            >
              {toRecordText(conflict)}
            </Typography>
          </details>
        </Alert>
      )}
      {issues.length > 0 && (
        <Alert severity="error">
          <Stack spacing={0.5}>
            {issues.map((issue, index) => (
              <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {issue}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
    </Stack>
  );
}
