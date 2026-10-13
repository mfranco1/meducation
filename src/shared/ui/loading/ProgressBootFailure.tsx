import { Alert, Button, Container } from '@mui/material';

export type ProgressBootFailureReason = 'unsupported-browser' | 'timed-out' | 'unavailable' | 'recovery-required';

const message: Record<ProgressBootFailureReason, string> = {
  'unsupported-browser': 'This browser cannot coordinate safe access to saved progress. Open Meducation in a browser that supports Web Locks, then try again.',
  'timed-out': 'Progress is being used by another Meducation tab. Close other Meducation tabs and retry.',
  unavailable: 'Saved progress could not be safely opened. Check browser storage access and retry.',
  'recovery-required': 'A previous progress operation needs recovery. Your saved data has been left untouched; reload to retry.',
};

export function ProgressBootFailure({ reason }: { reason: ProgressBootFailureReason }) {
  return <Container maxWidth="sm" sx={{ py: 6 }}>
    <Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Retry</Button>}>
      {message[reason]}
    </Alert>
  </Container>;
}
