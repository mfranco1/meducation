import { useState } from 'react';
import { Alert, Button, Container, Stack, Typography } from '@mui/material';

export type ProgressBootFailureReason = 'unsupported-browser' | 'timed-out' | 'unavailable' | 'recovery-required';

const message: Record<ProgressBootFailureReason, string> = {
  'unsupported-browser':
    'This browser cannot coordinate safe access to saved progress. Open Meducation in a browser that supports Web Locks, then try again.',
  'timed-out': 'Progress is being used by another Meducation tab. Close other Meducation tabs and retry.',
  unavailable: 'Saved progress could not be safely opened. Check browser storage access and retry.',
  'recovery-required':
    'A previous progress operation needs recovery. Your saved data has been left untouched; reload to retry.',
};

export function ProgressBootFailure({
  reason,
  onDownloadRecovery,
}: {
  reason: ProgressBootFailureReason;
  onDownloadRecovery: () => string | undefined;
}) {
  const [recoveryError, setRecoveryError] = useState<string>();
  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Stack spacing={2}>
        <Alert severity="error">{message[reason]}</Alert>
        <Typography variant="body2">
          The raw recovery file contains saved browser values, may capture a changing pair, and cannot be imported as a
          progress backup. Keep it private.
        </Typography>
        <Button variant="outlined" onClick={() => setRecoveryError(onDownloadRecovery())}>
          Download raw recovery copy
        </Button>
        {recoveryError && (
          <Alert severity="warning" role="alert">
            {recoveryError}
          </Alert>
        )}
        <Button color="inherit" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </Stack>
    </Container>
  );
}
